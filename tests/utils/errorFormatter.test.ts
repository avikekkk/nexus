import { test, expect } from "bun:test"
import { formatConnectionError } from "../../src/utils/errorFormatter.ts"

test("formats ENOTIMP error as timeout", () => {
  const error = new Error("getaddrinfo ENOTIMP")
  const formatted = formatConnectionError(error)
  expect(formatted).toBe(
    "Connection timed out. The database server is not reachable. Please check if the host is correct and the server is running."
  )
})

test("formats ENOTFOUND as DNS error", () => {
  const error = new Error("getaddrinfo ENOTFOUND example.com")
  const formatted = formatConnectionError(error)
  expect(formatted).toBe("Could not resolve hostname. Please check if the host address is correct and reachable.")
})

test("formats ECONNREFUSED as connection refused", () => {
  const error = new Error("connect ECONNREFUSED 127.0.0.1:27017")
  const formatted = formatConnectionError(error)
  expect(formatted).toBe(
    "Connection refused. The database server is not accepting connections. Please verify the host and port are correct and the server is running."
  )
})

test("formats ETIMEDOUT as timeout", () => {
  const error = new Error("connect ETIMEDOUT")
  const formatted = formatConnectionError(error)
  expect(formatted).toBe(
    "Connection timed out. The database server did not respond in time. Please check your network connection and server status."
  )
})

test("formats authentication errors", () => {
  const error = new Error("Authentication failed for user")
  const formatted = formatConnectionError(error)
  expect(formatted).toBe("Authentication failed. Please check your username and password.")
})

test("formats MongoServerSelectionError", () => {
  const error = new Error("MongoServerSelectionError: connection failed")
  const formatted = formatConnectionError(error)
  expect(formatted).toBe(
    "Could not connect to MongoDB server. Please verify the connection string and ensure the server is running."
  )
})

test("formats SSL errors", () => {
  const error = new Error("SSL certificate verification failed")
  const formatted = formatConnectionError(error)
  expect(formatted).toBe(
    "SSL/TLS connection error. Please check your SSL configuration or disable SSL if not required."
  )
})

test("cleans up Error prefix", () => {
  const error = new Error("Error: Some database error")
  const formatted = formatConnectionError(error)
  expect(formatted).toBe("Some database error")
})

test("handles string errors", () => {
  const formatted = formatConnectionError("Connection failed")
  expect(formatted).toBe("Connection failed")
})

test("handles cryptic error codes", () => {
  const error = new Error("ECONNRESET")
  const formatted = formatConnectionError(error)
  expect(formatted).toContain("Please check your connection settings")
})
