import pino from 'pino'
import * as Sentry from '@sentry/nextjs'

const isDevelopment = process.env.NODE_ENV !== 'production'
const isServer = typeof window === 'undefined'

if (!isDevelopment) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "https://your-sentry-dsn-here@o0.ingest.sentry.io/0",
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV,
  });
}

/**
 * Serializers to format specific objects in logs
 * Behavior varies between development and production for security
 */
const serializers = {
  /**
   * Serializes error objects
   * @param {Error} err - Error object
   * @returns {Object} Formatted error (stack trace only in development)
   */
  err: (err) => {
    return {
      type: err.constructor.name,
      message: err.message,
      stack: isDevelopment ? err.stack : undefined,
      code: err.code,
      statusCode: err.statusCode
    }
  },
  
  /**
   * Serializes HTTP request objects
   * @param {Object} req - Request object
   * @returns {Object} Formatted request (headers only in development)
   */
  req: (req) => {
    return {
      method: req.method,
      url: req.url,
      headers: isDevelopment ? req.headers : undefined,
      remoteAddress: req.remoteAddress
    }
  },
  
  /**
   * Serializes HTTP response objects
   * @param {Object} res - Response object
   * @returns {Object} Formatted response
   */
  res: (res) => {
    return {
      statusCode: res.statusCode
    }
  }
}

const formatters = {
  formatDate: (date, format = 'ISO') => {
    const d = date instanceof Date ? date : new Date(date)
    switch (format) {
      case 'ISO': return d.toISOString()
      case 'TIME': return d.toLocaleTimeString()
      case 'FULL': return d.toLocaleString()
      default: return d.toISOString()
    }
  },
  formatLevel: (level) => level.toUpperCase(),
  formatLogMessage: (time, level, ...args) => {
    const colors = {
      trace: '#6c757d',
      debug: '#0dcaf0',
      info: '#0d6efd',
      warn: '#ffc107',
      error: '#dc3545',
      fatal: '#7f1d1d'
    }
    
    console.log(
      `%c[${formatters.formatDate(time, 'TIME')}] %c${level}%c:`,
      'color: gray; font-weight: bold',
      `color: ${colors[level.toLowerCase()] || 'inherit'}; font-weight: bold`,
      'color: inherit',
      ...args
    )
  },
  getContext: () => ({ env: process.env.NODE_ENV, context: isServer ? 'server' : 'browser' })
}

/**
 * Handlers for Sentry integration in production
 * Manages sending critical logs for monitoring
 */
const sentryHandlers = {
  /**
   * Sends log to Sentry based on type
   * @param {string} level - Log level (error/fatal/warn)
   * @param {string|Error} message - Log message or Error object
   * @param {Object} extra - Additional context
   */
  sendToSentry: (level, message, extra = {}) => {
    if (!isDevelopment) {
      if (message instanceof Error) {
        Sentry.captureException(message, { level, extra })
      } else {
        Sentry.captureMessage(message, { level, extra })
      }
    }
  }
}

const devConfig = {
  browser: {
    asObject: true,
    write: {
      level: (level) => ({
        level: formatters.formatLevel(level),
        time: formatters.formatDate(new Date())
      }),
      transmit: (logEvent) => {
        const { time, level: levelLabel, ...rest } = logEvent
        formatters.formatLogMessage(time, levelLabel, ...Object.values(rest))
      }
    },
    formatters: {
      level: (label) => ({ level: formatters.formatLevel(label) }),
      bindings: () => formatters.getContext(),
      log: (object) => ({ ...object, timestamp: formatters.formatDate(new Date(), 'FULL') })
    }
  },
  level: 'trace',
  serializers,
  base: { pid: undefined, hostname: undefined }
}

const prodConfig = {
  browser: {
    asObject: true,
    formatters: {
      level: (label) => ({ level: formatters.formatLevel(label) })
    },
    transmit: {
      level: 'warn',
      send: (level, logEvent) => {
        const { messages = [], bindings = {} } = logEvent
        const message = messages.join(' ')
        
        console[level](`[${formatters.formatLevel(level)}] ${message}`)
        
        if (['warn', 'error', 'fatal'].includes(level)) {
          sentryHandlers.sendToSentry(level, message, bindings)
        }
      }
    }
  },
  level: 'warn',
  hooks: {
    logMethod(inputArgs, method) {
      if (!isDevelopment && isServer) {
        const level = this.level
        const [msg, ...args] = inputArgs
        
        if (['warn', 'error', 'fatal'].includes(level)) {
          sentryHandlers.sendToSentry(level, msg, { args })
        }
      }
      return method.apply(this, inputArgs)
    }
  },
  serializers,
  base: null,
  timestamp: false,
  redact: ['password', 'secret', 'token', 'authorization', 'cookie']
}

const baseLogger = pino(isDevelopment ? devConfig : prodConfig)

/**
 * Logger configured for different environments:
 * - Development: verbose logs (trace+) in console with colors
 * - Production: critical logs (warn+) sent to Sentry
 */
const logger = {
  // Development-only logs
  trace: (...args) => isDevelopment ? baseLogger.trace(...args) : undefined,
  debug: (...args) => isDevelopment ? baseLogger.debug(...args) : undefined,
  
  // Standard info logs
  info: (...args) => baseLogger.info(...args),
  
  // Critical logs with Sentry integration
  warn: (...args) => baseLogger.warn(...args),
  error: (...args) => baseLogger.error(...args),
  fatal: (...args) => baseLogger.fatal(...args),
  
  // Contextual logging
  child: (bindings) => baseLogger.child(bindings)
}

/**
 * Logger configured for:
 * - Development: verbose logs (trace, debug, info, warn, error, fatal) in console
 * - Production: critical logs (warn, error, fatal) sent to Sentry
 * 
 * Usage examples:
 * logger.trace('Detailed information', { data })  // Only in development
 * logger.debug('Debug information', { id })  // Only in development
 * logger.info('Normal events', { user })  // Only in development
 * logger.warn('Important warnings', { issue })  // In all environments + Sentry in production
 * logger.error('Critical errors', { error })  // In all environments + Sentry in production
 * logger.fatal('Fatal errors', { crash })  // In all environments + Sentry in production
 * 
 * // Create a child logger with context
 * const moduleLogger = logger.child({ module: 'auth' })
 * moduleLogger.info('User logged in')  // Will include module: 'auth' in all logs
 */

export default logger