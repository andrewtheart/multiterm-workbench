using System;
using System.Runtime.InteropServices;
using System.Text;

namespace MultiTerm.PromptLibraryHost
{
    internal sealed class PromptLibraryException : Exception
    {
        public string Code { get; private set; }

        public PromptLibraryException(string code, string message) : base(message)
        {
            Code = code;
        }
    }

    internal sealed class NativeSqlite : IDisposable
    {
        private const string Library = "sqlite3mc.dll";
        private const int Ok = 0;
        private const int Row = 100;
        private const int Done = 101;
        private const int OpenReadWrite = 0x00000002;
        private const int OpenCreate = 0x00000004;
        private const int OpenFullMutex = 0x00010000;
        private static readonly IntPtr Transient = new IntPtr(-1);
        private IntPtr database;

        private NativeSqlite(IntPtr database)
        {
            this.database = database;
        }

        public static NativeSqlite Open(string path, byte[] key)
        {
            IntPtr handle;
            using (Utf8Value fileName = new Utf8Value(path))
            {
                int result = sqlite3_open_v2(
                    fileName.Pointer,
                    out handle,
                    OpenReadWrite | OpenCreate | OpenFullMutex,
                    IntPtr.Zero);
                if (result != Ok)
                {
                    string message = handle == IntPtr.Zero ? "SQLite could not open the prompt library." : Error(handle);
                    if (handle != IntPtr.Zero) sqlite3_close_v2(handle);
                    throw new PromptLibraryException("database_open_failed", message);
                }
            }

            var connection = new NativeSqlite(handle);
            try
            {
                connection.ConfigureEncryption(key);
                connection.Exec("PRAGMA memory_security=1;");
                connection.Exec("PRAGMA foreign_keys=ON;");
                connection.Exec("PRAGMA trusted_schema=OFF;");
                connection.Exec("PRAGMA temp_store=MEMORY;");
                connection.Exec("PRAGMA busy_timeout=5000;");
                connection.Exec("PRAGMA journal_mode=WAL;");
                connection.Exec("PRAGMA synchronous=FULL;");
                return connection;
            }
            catch
            {
                connection.Dispose();
                throw;
            }
        }

        private void ConfigureEncryption(byte[] key)
        {
            int cipher = sqlite3mc_cipher_index("chacha20");
            if (cipher <= 0 || sqlite3mc_config(database, "cipher", cipher) != cipher)
            {
                throw new PromptLibraryException("cipher_unavailable", "The required ChaCha20 prompt library cipher is unavailable.");
            }
            if (sqlite3mc_config_cipher(database, "chacha20", "legacy", 0) != 0
                || sqlite3mc_config(database, "hmac_check", 1) != 1
                || sqlite3mc_config(database, "mc_legacy_wal", 0) != 0)
            {
                throw new PromptLibraryException("cipher_configuration_failed", "The prompt library cipher could not be configured securely.");
            }

            byte[] rawKey = RawKey(key);
            try
            {
                Check(sqlite3_key(database, rawKey, rawKey.Length), "The prompt library key could not be applied.");
                ScalarInt64("SELECT count(*) FROM sqlite_master;");
                if (sqlite3mc_config(database, "cipher", -1) != cipher
                    || sqlite3mc_config(database, "hmac_check", -1) != 1
                    || sqlite3mc_config(database, "mc_legacy_wal", -1) != 0)
                {
                    throw new PromptLibraryException("cipher_verification_failed", "The prompt library cipher configuration could not be verified.");
                }
            }
            catch (PromptLibraryException)
            {
                throw;
            }
            catch
            {
                throw new PromptLibraryException("database_unlock_failed", "The encrypted prompt library could not be unlocked or authenticated.");
            }
            finally
            {
                SecurityMemory.Zero(rawKey);
            }
        }

        private static byte[] RawKey(byte[] key)
        {
            if (key == null || key.Length != 32)
            {
                throw new PromptLibraryException("invalid_key", "The prompt library key has an invalid length.");
            }
            byte[] prefix = Encoding.ASCII.GetBytes("raw:");
            byte[] value = new byte[prefix.Length + (key.Length * 2)];
            Buffer.BlockCopy(prefix, 0, value, 0, prefix.Length);
            const string hex = "0123456789abcdef";
            for (int index = 0; index < key.Length; index++)
            {
                value[prefix.Length + (index * 2)] = (byte)hex[key[index] >> 4];
                value[prefix.Length + (index * 2) + 1] = (byte)hex[key[index] & 0x0f];
            }
            return value;
        }

        public void Exec(string sql)
        {
            IntPtr error;
            int result = sqlite3_exec(database, sql, IntPtr.Zero, IntPtr.Zero, out error);
            if (result == Ok) return;
            string message = error == IntPtr.Zero ? Error(database) : Utf8(error);
            if (error != IntPtr.Zero) sqlite3_free(error);
            throw new PromptLibraryException("database_error", message);
        }

        public SqliteStatement Prepare(string sql)
        {
            IntPtr statement;
            using (Utf8Value query = new Utf8Value(sql))
            {
                Check(sqlite3_prepare_v2(database, query.Pointer, -1, out statement, IntPtr.Zero), "The prompt library query could not be prepared.");
            }
            return new SqliteStatement(this, statement);
        }

        public long ScalarInt64(string sql)
        {
            using (SqliteStatement statement = Prepare(sql))
            {
                if (!statement.Step()) throw new PromptLibraryException("database_error", "The prompt library query returned no value.");
                return statement.Int64(0);
            }
        }

        public int Changes()
        {
            return sqlite3_changes(database);
        }

        internal void Check(int result, string fallback)
        {
            if (result == Ok) return;
            string detail = Error(database);
            throw new PromptLibraryException("database_error", String.IsNullOrWhiteSpace(detail) ? fallback : detail);
        }

        internal static bool Step(IntPtr statement, IntPtr database)
        {
            int result = sqlite3_step(statement);
            if (result == Row) return true;
            if (result == Done) return false;
            throw new PromptLibraryException("database_error", Error(database));
        }

        public void Dispose()
        {
            IntPtr handle = database;
            database = IntPtr.Zero;
            if (handle != IntPtr.Zero) sqlite3_close_v2(handle);
        }

        private static string Error(IntPtr handle)
        {
            return Utf8(sqlite3_errmsg(handle));
        }

        internal static string Utf8(IntPtr value)
        {
            if (value == IntPtr.Zero) return String.Empty;
            int length = 0;
            while (Marshal.ReadByte(value, length) != 0) length++;
            byte[] bytes = new byte[length];
            Marshal.Copy(value, bytes, 0, length);
            return Encoding.UTF8.GetString(bytes);
        }

        internal IntPtr Handle { get { return database; } }

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_open_v2(IntPtr fileName, out IntPtr database, int flags, IntPtr vfs);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_close_v2(IntPtr database);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_key(IntPtr database, byte[] key, int length);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern int sqlite3mc_cipher_index(string cipherName);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern int sqlite3mc_config(IntPtr database, string parameter, int value);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern int sqlite3mc_config_cipher(IntPtr database, string cipherName, string parameter, int value);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        private static extern int sqlite3_exec(IntPtr database, string sql, IntPtr callback, IntPtr argument, out IntPtr error);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_prepare_v2(IntPtr database, IntPtr sql, int length, out IntPtr statement, IntPtr tail);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        internal static extern int sqlite3_bind_text16(IntPtr statement, int index, [MarshalAs(UnmanagedType.LPWStr)] string value, int bytes, IntPtr destructor);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        internal static extern int sqlite3_bind_int64(IntPtr statement, int index, long value);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_step(IntPtr statement);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        internal static extern IntPtr sqlite3_column_text16(IntPtr statement, int column);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        internal static extern long sqlite3_column_int64(IntPtr statement, int column);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        internal static extern int sqlite3_finalize(IntPtr statement);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int sqlite3_changes(IntPtr database);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern IntPtr sqlite3_errmsg(IntPtr database);

        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern void sqlite3_free(IntPtr value);

        internal static IntPtr TransientDestructor { get { return Transient; } }
    }

    internal sealed class SqliteStatement : IDisposable
    {
        private readonly NativeSqlite owner;
        private IntPtr statement;

        public SqliteStatement(NativeSqlite owner, IntPtr statement)
        {
            this.owner = owner;
            this.statement = statement;
        }

        public void BindText(int index, string value)
        {
            string text = value ?? String.Empty;
            owner.Check(
                NativeSqlite.sqlite3_bind_text16(statement, index, text, text.Length * 2, NativeSqlite.TransientDestructor),
                "The prompt library value could not be bound.");
        }

        public void BindInt64(int index, long value)
        {
            owner.Check(NativeSqlite.sqlite3_bind_int64(statement, index, value), "The prompt library value could not be bound.");
        }

        public bool Step()
        {
            return NativeSqlite.Step(statement, owner.Handle);
        }

        public string Text(int column)
        {
            IntPtr value = NativeSqlite.sqlite3_column_text16(statement, column);
            return value == IntPtr.Zero ? String.Empty : Marshal.PtrToStringUni(value);
        }

        public long Int64(int column)
        {
            return NativeSqlite.sqlite3_column_int64(statement, column);
        }

        public void Dispose()
        {
            IntPtr handle = statement;
            statement = IntPtr.Zero;
            if (handle != IntPtr.Zero) NativeSqlite.sqlite3_finalize(handle);
        }
    }

    internal sealed class Utf8Value : IDisposable
    {
        public IntPtr Pointer { get; private set; }

        public Utf8Value(string value)
        {
            byte[] bytes = Encoding.UTF8.GetBytes((value ?? String.Empty) + "\0");
            Pointer = Marshal.AllocHGlobal(bytes.Length);
            Marshal.Copy(bytes, 0, Pointer, bytes.Length);
        }

        public void Dispose()
        {
            IntPtr value = Pointer;
            Pointer = IntPtr.Zero;
            if (value != IntPtr.Zero) Marshal.FreeHGlobal(value);
        }
    }
}