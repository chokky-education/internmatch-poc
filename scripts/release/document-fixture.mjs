export const DOCUMENT_FIXTURE_TABLES = ['sessions','applications','tasks','documents','reminders','messages','extractions','audit_log','milestones','pending_actions','seasons','users'];
export const fixtureOwnerColumn = table => table === 'users' ? 'id' : 'user_id';

// D1 limits compound SELECT terms more tightly than local SQLite. Scalar
// subqueries keep cleanup verification to one result without UNION terms.
export function documentFixtureCountSql(id) {
  if (!/^documents-smoke-[a-f0-9]{16}$/.test(id)) throw Error('Expected a reserved document fixture ID');
  return 'SELECT ' + DOCUMENT_FIXTURE_TABLES.map(table => `(SELECT COUNT(*) FROM ${table} WHERE ${fixtureOwnerColumn(table)}='${id}')`).join(' + ') + ' AS n';
}
