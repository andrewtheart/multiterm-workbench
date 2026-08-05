using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

namespace MultiTerm.PromptLibraryHost
{
    internal sealed class PromptLibraryRecoveryException : Exception
    {
        public PromptLibraryRecoveryException(string message) : base(message) { }
    }

    internal sealed class PromptLibraryPaths
    {
        public string DatabasePath { get; private set; }
        public string KeyPath { get; private set; }

        public static PromptLibraryPaths Resolve()
        {
            string overridePath = Environment.GetEnvironmentVariable("MULTITERM_PROMPT_LIBRARY_DB");
            bool testMode = String.Equals(
                Environment.GetEnvironmentVariable("MULTITERM_PROMPT_LIBRARY_TEST_MODE"),
                "1",
                StringComparison.Ordinal);
            string databasePath;
            if (!String.IsNullOrWhiteSpace(overridePath))
            {
                if (!testMode)
                {
                    throw new InvalidOperationException(
                        "The prompt library database path can be overridden only in test mode.");
                }
                databasePath = Path.GetFullPath(overridePath);
            }
            else
            {
                string localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                databasePath = Path.Combine(localData, "MultiTerm", "PromptLibrary", "library.db");
            }

            return new PromptLibraryPaths
            {
                DatabasePath = databasePath,
                KeyPath = databasePath + ".key"
            };
        }
    }

    internal sealed class KeyLease : IDisposable
    {
        public byte[] Key { get; private set; }
        public bool IsNew { get; private set; }

        public KeyLease(byte[] key, bool isNew)
        {
            Key = key;
            IsNew = isNew;
        }

        public void Dispose()
        {
            byte[] key = Key;
            Key = Array.Empty<byte>();
            IsNew = false;
            SecurityMemory.Zero(key);
        }
    }

    internal static class SecurityMemory
    {
        [MethodImpl(MethodImplOptions.NoInlining | MethodImplOptions.NoOptimization)]
        public static void Zero(byte[] value)
        {
            if (value == null) return;
            for (int index = 0; index < value.Length; index++) value[index] = 0;
        }
    }

    internal static class PromptLibraryKeyStore
    {
        private static readonly byte[] Magic = Encoding.ASCII.GetBytes("MTPKEY01");
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("MultiTerm.PromptLibrary/v1");

        public static KeyLease Open(PromptLibraryPaths paths)
        {
            EnsurePrivateDirectory(paths.DatabasePath);
            bool databaseExists = File.Exists(paths.DatabasePath)
                && new FileInfo(paths.DatabasePath).Length > 0;
            bool keyExists = File.Exists(paths.KeyPath);

            if (databaseExists && !keyExists)
            {
                throw new PromptLibraryRecoveryException(
                    "The encrypted prompt library exists, but its protected key is missing.");
            }
            if (!databaseExists && keyExists)
            {
                throw new PromptLibraryRecoveryException(
                    "The protected prompt library key exists, but its database is missing.");
            }
            if (!keyExists)
            {
                byte[] key = new byte[32];
                using (RandomNumberGenerator generator = RandomNumberGenerator.Create())
                {
                    generator.GetBytes(key);
                }
                try
                {
                    WriteProtectedKey(paths.KeyPath, key);
                    return new KeyLease(key, true);
                }
                catch
                {
                    SecurityMemory.Zero(key);
                    throw;
                }
            }

            byte[] file = File.ReadAllBytes(paths.KeyPath);
            if (file.Length <= Magic.Length || !HasMagic(file))
            {
                throw new PromptLibraryRecoveryException("The protected prompt library key file is invalid.");
            }
            byte[] encrypted = new byte[file.Length - Magic.Length];
            Buffer.BlockCopy(file, Magic.Length, encrypted, 0, encrypted.Length);
            byte[] decrypted = null;
            try
            {
                decrypted = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
                if (decrypted.Length != 32)
                {
                    throw new PromptLibraryRecoveryException("The protected prompt library key has an invalid length.");
                }
                return new KeyLease(decrypted, false);
            }
            catch
            {
                SecurityMemory.Zero(decrypted);
                throw;
            }
            finally
            {
                SecurityMemory.Zero(file);
                SecurityMemory.Zero(encrypted);
            }
        }

        private static void EnsurePrivateDirectory(string databasePath)
        {
            string directoryPath = Path.GetDirectoryName(databasePath);
            Directory.CreateDirectory(directoryPath);
            SecurityIdentifier currentUser;
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                currentUser = identity.User;
            }
            if (currentUser == null)
            {
                throw new UnauthorizedAccessException("The current Windows user could not be identified.");
            }

            var security = new DirectorySecurity();
            security.SetOwner(currentUser);
            security.SetAccessRuleProtection(true, false);
            const InheritanceFlags inheritance = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
            security.AddAccessRule(new FileSystemAccessRule(
                currentUser,
                FileSystemRights.FullControl,
                inheritance,
                PropagationFlags.None,
                AccessControlType.Allow));
            security.AddAccessRule(new FileSystemAccessRule(
                new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                FileSystemRights.FullControl,
                inheritance,
                PropagationFlags.None,
                AccessControlType.Allow));
            new DirectoryInfo(directoryPath).SetAccessControl(security);
        }

        private static void WriteProtectedKey(string keyPath, byte[] key)
        {
            byte[] encrypted = ProtectedData.Protect(key, Entropy, DataProtectionScope.CurrentUser);
            byte[] file = new byte[Magic.Length + encrypted.Length];
            Buffer.BlockCopy(Magic, 0, file, 0, Magic.Length);
            Buffer.BlockCopy(encrypted, 0, file, Magic.Length, encrypted.Length);
            string temporary = keyPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    stream.Write(file, 0, file.Length);
                    stream.Flush(true);
                }
                File.Move(temporary, keyPath);
            }
            finally
            {
                if (File.Exists(temporary)) File.Delete(temporary);
                SecurityMemory.Zero(encrypted);
                SecurityMemory.Zero(file);
            }
        }

        private static bool HasMagic(byte[] value)
        {
            int difference = 0;
            for (int index = 0; index < Magic.Length; index++)
            {
                difference |= value[index] ^ Magic[index];
            }
            return difference == 0;
        }
    }
}