using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;

namespace MultiTerm.PromptLibraryHost
{
    internal sealed class PromptRecord
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Body { get; set; }
        public string CreatedAt { get; set; }
        public string UpdatedAt { get; set; }
        public long Revision { get; set; }
    }

    internal sealed class PromptLibraryStore : IDisposable
    {
        private readonly NativeSqlite database;

        private PromptLibraryStore(NativeSqlite database)
        {
            this.database = database;
        }

        public static PromptLibraryStore Open()
        {
            PromptLibraryPaths paths = PromptLibraryPaths.Resolve();
            KeyLease lease = null;
            NativeSqlite connection = null;
            try
            {
                lease = PromptLibraryKeyStore.Open(paths);
                connection = NativeSqlite.Open(paths.DatabasePath, lease.Key);
                var store = new PromptLibraryStore(connection);
                connection = null;
                store.InitializeSchema();
                return store;
            }
            catch
            {
                if (connection != null) connection.Dispose();
                if (lease != null && lease.IsNew)
                {
                    DeleteNewFile(paths.DatabasePath);
                    DeleteNewFile(paths.DatabasePath + "-wal");
                    DeleteNewFile(paths.DatabasePath + "-shm");
                    DeleteNewFile(paths.KeyPath);
                }
                throw;
            }
            finally
            {
                if (lease != null) lease.Dispose();
            }
        }

        private static void DeleteNewFile(string path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch
            {
                // The original initialization error remains the actionable failure.
            }
        }

        private void InitializeSchema()
        {
            database.Exec(
                "CREATE TABLE IF NOT EXISTS prompts ("
                + "id TEXT NOT NULL PRIMARY KEY,"
                + "name TEXT NOT NULL,"
                + "body TEXT NOT NULL,"
                + "created_at TEXT NOT NULL,"
                + "updated_at TEXT NOT NULL,"
                + "revision INTEGER NOT NULL CHECK(revision > 0)"
                + ") STRICT;"
                + "CREATE TABLE IF NOT EXISTS library_meta ("
                + "singleton INTEGER NOT NULL PRIMARY KEY CHECK(singleton = 1),"
                + "revision INTEGER NOT NULL CHECK(revision >= 0)"
                + ") STRICT;"
                + "INSERT OR IGNORE INTO library_meta(singleton, revision) VALUES(1, 0);"
                + "PRAGMA user_version=1;");
        }

        public long LibraryRevision()
        {
            return database.ScalarInt64("SELECT revision FROM library_meta WHERE singleton=1;");
        }

        public List<PromptRecord> List()
        {
            var prompts = new List<PromptRecord>();
            using (SqliteStatement statement = database.Prepare(
                "SELECT id,name,created_at,updated_at,revision FROM prompts "
                + "ORDER BY updated_at DESC, name COLLATE NOCASE ASC;"))
            {
                while (statement.Step())
                {
                    prompts.Add(new PromptRecord
                    {
                        Id = statement.Text(0),
                        Name = statement.Text(1),
                        Body = null,
                        CreatedAt = statement.Text(2),
                        UpdatedAt = statement.Text(3),
                        Revision = statement.Int64(4)
                    });
                }
            }
            return prompts;
        }

        public PromptRecord Get(string rawId)
        {
            string id = RequiredId(rawId);
            using (SqliteStatement statement = database.Prepare(
                "SELECT id,name,body,created_at,updated_at,revision FROM prompts WHERE id=?1;"))
            {
                statement.BindText(1, id);
                if (!statement.Step())
                {
                    throw new PromptLibraryException("not_found", "That prompt is no longer in the library.");
                }
                return ReadPrompt(statement);
            }
        }

        public PromptRecord Upsert(string rawId, string rawName, string body, long expectedRevision)
        {
            string name = (rawName ?? String.Empty).Trim();
            if (name.Length == 0) throw new PromptLibraryException("invalid_name", "Enter a prompt name before saving.");
            if (body == null) throw new PromptLibraryException("invalid_body", "The prompt body is invalid.");

            string id = String.IsNullOrWhiteSpace(rawId) ? null : RequiredId(rawId);
            string now = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
            database.Exec("BEGIN IMMEDIATE;");
            try
            {
                if (id == null)
                {
                    id = Guid.NewGuid().ToString("D");
                    using (SqliteStatement insert = database.Prepare(
                        "INSERT INTO prompts(id,name,body,created_at,updated_at,revision) VALUES(?1,?2,?3,?4,?4,1);"))
                    {
                        insert.BindText(1, id);
                        insert.BindText(2, name);
                        insert.BindText(3, body);
                        insert.BindText(4, now);
                        insert.Step();
                    }
                }
                else
                {
                    if (expectedRevision <= 0)
                    {
                        throw new PromptLibraryException("invalid_revision", "Reload the prompt before saving changes.");
                    }
                    using (SqliteStatement update = database.Prepare(
                        "UPDATE prompts SET name=?1,body=?2,updated_at=?3,revision=revision+1 "
                        + "WHERE id=?4 AND revision=?5;"))
                    {
                        update.BindText(1, name);
                        update.BindText(2, body);
                        update.BindText(3, now);
                        update.BindText(4, id);
                        update.BindInt64(5, expectedRevision);
                        update.Step();
                    }
                    if (database.Changes() != 1)
                    {
                        if (Exists(id))
                        {
                            throw new PromptLibraryException("conflict", "This prompt changed in another window. Reload it or save a copy.");
                        }
                        throw new PromptLibraryException("not_found", "That prompt is no longer in the library.");
                    }
                }
                AdvanceLibraryRevision();
                database.Exec("COMMIT;");
            }
            catch
            {
                try { database.Exec("ROLLBACK;"); } catch { }
                throw;
            }
            return Get(id);
        }

        public void Delete(string rawId, long expectedRevision)
        {
            string id = RequiredId(rawId);
            if (expectedRevision <= 0)
            {
                throw new PromptLibraryException("invalid_revision", "Reload the prompt before deleting it.");
            }
            database.Exec("BEGIN IMMEDIATE;");
            try
            {
                using (SqliteStatement delete = database.Prepare("DELETE FROM prompts WHERE id=?1 AND revision=?2;"))
                {
                    delete.BindText(1, id);
                    delete.BindInt64(2, expectedRevision);
                    delete.Step();
                }
                if (database.Changes() != 1)
                {
                    if (Exists(id))
                    {
                        throw new PromptLibraryException("conflict", "This prompt changed in another window. Reload it before deleting.");
                    }
                    throw new PromptLibraryException("not_found", "That prompt is no longer in the library.");
                }
                AdvanceLibraryRevision();
                database.Exec("COMMIT;");
            }
            catch
            {
                try { database.Exec("ROLLBACK;"); } catch { }
                throw;
            }
        }

        private bool Exists(string id)
        {
            using (SqliteStatement statement = database.Prepare("SELECT 1 FROM prompts WHERE id=?1;"))
            {
                statement.BindText(1, id);
                return statement.Step();
            }
        }

        private void AdvanceLibraryRevision()
        {
            database.Exec("UPDATE library_meta SET revision=revision+1 WHERE singleton=1;");
        }

        private static PromptRecord ReadPrompt(SqliteStatement statement)
        {
            return new PromptRecord
            {
                Id = statement.Text(0),
                Name = statement.Text(1),
                Body = statement.Text(2),
                CreatedAt = statement.Text(3),
                UpdatedAt = statement.Text(4),
                Revision = statement.Int64(5)
            };
        }

        private static string RequiredId(string value)
        {
            Guid id;
            if (!Guid.TryParse(value, out id))
            {
                throw new PromptLibraryException("invalid_id", "The prompt identifier is invalid.");
            }
            return id.ToString("D");
        }

        public void Dispose()
        {
            database.Dispose();
        }
    }
}