import { describe, expect, test } from "bun:test"
import { formatQuery, highlightQueryLines, tokenizeQuery } from "../../../src/query/editor/highlight.ts"

describe("query highlighting", () => {
  test("highlights SQL keywords, fields, strings, and numbers", () => {
    const tokens = tokenizeQuery("SELECT name FROM users WHERE age >= 18 AND status = 'active'", "postgres")

    expect(tokens.find((token) => token.text === "SELECT")?.role).toBe("keyword")
    expect(tokens.find((token) => token.text === "name")?.role).toBe("text")
    expect(tokens.find((token) => token.text === "18")?.role).toBe("number")
    expect(tokens.find((token) => token.text === "'active'")?.role).toBe("string")
  })

  test("highlights Mongo shell methods, field keys, operators, and strings", () => {
    const tokens = tokenizeQuery('db.users.find({name: "Ada", age: {$gte: 18}}).limit(20)', "mongo")

    expect(tokens.find((token) => token.text === "db")?.role).toBe("keyword")
    expect(tokens.find((token) => token.text === "find")?.role).toBe("function")
    expect(tokens.find((token) => token.text === "name")?.role).toBe("field")
    expect(tokens.find((token) => token.text === "$gte")?.role).toBe("operator")
    expect(tokens.find((token) => token.text === '"Ada"')?.role).toBe("string")
  })

  test("does not treat Mongo field names like Elasticsearch operators", () => {
    const tokens = tokenizeQuery('db.events.find({"query": "db"})', "mongo")

    expect(tokens.find((token) => token.text === '"query"')?.role).toBe("field")
  })

  test("highlights Elasticsearch JSON keys and DSL operators", () => {
    const tokens = tokenizeQuery('{"query": {"match": {"title": "db"}}}', "elasticsearch")

    expect(tokens.find((token) => token.text === '"query"')?.role).toBe("operator")
    expect(tokens.find((token) => token.text === '"match"')?.role).toBe("operator")
    expect(tokens.find((token) => token.text === '"title"')?.role).toBe("field")
    expect(tokens.find((token) => token.text === '"db"')?.role).toBe("string")
  })

  test("highlights Redis commands and keys", () => {
    const tokens = tokenizeQuery("GET session:1", "redis")

    expect(tokens.find((token) => token.text === "GET")?.role).toBe("function")
    expect(tokens.find((token) => token.text === "session")?.role).toBe("field")
  })

  test("splits highlighted query into line-local tokens", () => {
    const lines = highlightQueryLines("SELECT *\nFROM users", "mysql")

    expect(lines).toHaveLength(2)
    expect(lines[0]?.tokens.some((token) => token.text === "SELECT")).toBe(true)
    expect(lines[1]?.tokens.some((token) => token.text === "FROM")).toBe(true)
  })

  test("falls back to one plain token for large input", () => {
    const query = "x".repeat(30_001)
    const tokens = tokenizeQuery(query, "mongo")

    expect(tokens).toEqual([{ start: 0, end: query.length, text: query, role: "text" }])
  })
})

describe("query formatting", () => {
  test("formats Elasticsearch JSON on demand", () => {
    const result = formatQuery('{"query":{"match":{"title":"db"}},"size":10}', "elasticsearch")

    expect(result.changed).toBe(true)
    expect(result.query).toContain('\n  "query": {')
    expect(result.query).toContain('"size": 10')
    expect(result.cursor).toBe(result.query.length)
  })

  test("leaves invalid Elasticsearch JSON unchanged", () => {
    const query = '{"query": {"match":'
    const result = formatQuery(query, "elasticsearch", 5)

    expect(result).toEqual({ query, cursor: 5, changed: false })
  })

  test("formats balanced Mongo shell-style structure conservatively", () => {
    const result = formatQuery('db.users.find({name:"Ada",age:{$gte:18}}).limit(20)', "mongo")

    expect(result.changed).toBe(true)
    expect(result.query).toContain("{\n  name: ")
    expect(result.query).toContain("$gte: 18")
  })

  test("formats SQL with stable clause breaks", () => {
    const result = formatQuery("select * from users where age >= 18 and status = 'active' order by name limit 20", "mysql")

    expect(result.changed).toBe(true)
    expect(result.query).toContain("\nfrom users")
    expect(result.query).toContain("\n  and status")
  })

  test("normalizes Redis whitespace", () => {
    const result = formatQuery("  GET    session:1  ", "redis")

    expect(result).toEqual({ query: "GET session:1", cursor: "GET session:1".length, changed: true })
  })
})
