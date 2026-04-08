/**
 * Formats database connection errors into user-friendly messages
 */
export function formatConnectionError(error: unknown, _connectionUri?: string): string {
  const rawMessage = error instanceof Error ? error.message : String(error)

  // DNS/Network errors
  if (rawMessage.includes("ENOTFOUND") || rawMessage.includes("getaddrinfo ENOTFOUND")) {
    return "Could not resolve hostname. Please check if the host address is correct and reachable."
  }

  if (rawMessage.includes("ENOTIMP")) {
    return "Connection timed out. The database server is not reachable. Please check if the host is correct and the server is running."
  }

  if (rawMessage.includes("ECONNREFUSED")) {
    return "Connection refused. The database server is not accepting connections. Please verify the host and port are correct and the server is running."
  }

  if (rawMessage.includes("ETIMEDOUT") || rawMessage.includes("timeout")) {
    return "Connection timed out. The database server did not respond in time. Please check your network connection and server status."
  }

  if (rawMessage.includes("EHOSTUNREACH")) {
    return "Host unreachable. Cannot reach the database server. Please check your network connection and firewall settings."
  }

  if (rawMessage.includes("ENETUNREACH")) {
    return "Network unreachable. Please check your network connection."
  }

  // Authentication errors
  if (
    rawMessage.includes("Authentication failed") ||
    rawMessage.includes("auth failed") ||
    rawMessage.includes("SASL")
  ) {
    return "Authentication failed. Please check your username and password."
  }

  if (rawMessage.includes("not authorized") || rawMessage.includes("unauthorized")) {
    return "Not authorized. You don't have permission to access this database."
  }

  // MongoDB specific errors
  if (rawMessage.includes("MongoServerSelectionError")) {
    return "Could not connect to MongoDB server. Please verify the connection string and ensure the server is running."
  }

  if (rawMessage.includes("MongoNetworkError")) {
    return "Network error while connecting to MongoDB. Please check your connection and try again."
  }

  // PostgreSQL specific errors
  if (rawMessage.includes("password authentication failed")) {
    return "Password authentication failed. Please check your credentials."
  }

  if (rawMessage.includes("does not exist") && rawMessage.includes("database")) {
    return "Database does not exist. Please verify the database name."
  }

  // Generic SSL/TLS errors
  if (rawMessage.includes("SSL") || rawMessage.includes("TLS") || rawMessage.includes("certificate")) {
    return "SSL/TLS connection error. Please check your SSL configuration or disable SSL if not required."
  }

  // If no specific pattern matches, return a cleaned up version of the error
  // Remove technical prefixes and keep the core message
  const cleaned = rawMessage
    .replace(/^Error:\s*/i, "")
    .replace(/^MongoError:\s*/i, "")
    .replace(/^PostgresError:\s*/i, "")
    .trim()

  // If the message is too technical or cryptic, provide a generic but helpful message
  if (cleaned.length < 10 || /^[A-Z_]+$/.test(cleaned)) {
    return `Connection failed: ${cleaned}. Please check your connection settings and ensure the database server is accessible.`
  }

  return cleaned
}
