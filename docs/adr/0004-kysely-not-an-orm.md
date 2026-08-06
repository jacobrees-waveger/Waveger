# Kysely instead of an ORM

Database access uses Kysely, a typed query builder, rather than Drizzle or
Prisma. Waveger's heaviest queries are set-based Settlement queries over Chart
snapshots, where object-relational mapping contributes nothing and gets in the
way.

## Considered options

- **Drizzle.** Still 0.45.2 with 1.0 in release-candidate for a year and ~1,900
  open issues. Adopting it means adopting a version everyone expects to
  replace, which the project's engineering principles reject.
- **Prisma 7.** Ships a substantially different client surface, so it carries
  migration cost, and its own documentation pushes hard toward the proprietary
  Accelerate layer.

## Consequences

We write something close to SQL and get typing over it, rather than getting
migrations and a schema DSL for free. That is the intended trade: the query
shapes here are analytical, and hand-written SQL is the clearer expression of
them.
