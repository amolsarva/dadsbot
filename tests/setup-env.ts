/**
 * Default environment for the unit test suite.
 *
 * The Supabase table names are required at runtime (they have no built-in
 * defaults), so without them every code path that touches session storage
 * throws before the test can exercise it. Individual tests still override
 * these values where they need to assert on specific configuration.
 */
process.env.SUPABASE_URL ||= 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key'
process.env.SUPABASE_STORAGE_BUCKET ||= 'test-bucket'
process.env.SUPABASE_SESSIONS_TABLE ||= 'sessions'
process.env.SUPABASE_TURNS_TABLE ||= 'conversation_turns'
process.env.DEFAULT_NOTIFY_EMAIL ||= 'test@example.com'
process.env.MAIL_FROM ||= 'dadsbot@example.com'
