import pino from 'pino'
import * as Sentry from '@sentry/nextjs'

const isDevelopment = process.env.NODE_ENV !== 'production'
const isServer = typeof window === 'undefined'

if (!isDevelopment) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
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
  formatLevel: (level) => level.toUpperCase(),
  
  formatDate: (date, format = 'ISO') => {
    const d = date instanceof Date ? date : new Date(date)
    switch (format) {
      case 'TIME': return d.toLocaleTimeString()
      case 'FULL': return d.toLocaleString()
      default: return d.toISOString()
    }
  },

  /**
   * Formats console message with colors (development only)
   */
  formatConsole: (level, message, bindings = {}) => {
    const colors = {
      trace: '#6c757d',
      debug: '#0dcaf0',
      info: '#0d6efd',
      warn: '#ffc107',
      error: '#dc3545',
      fatal: '#dc3545'
    }

    const time = formatters.formatDate(new Date(), 'TIME')
    let text = ''

    if (typeof message === 'object' && message !== null) {
      const { error, ...details } = message
      text = error || ''
      if (Object.keys(details).length) {
        text += ` (${Object.entries(details)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')})`
      }
    } else {
      text = String(message)
    }
    
    console.log(
      `%c[${time}] %c${formatters.formatLevel(level)}%c: ${text}`,
      'color: gray; font-weight: bold',
      `color: ${colors[level.toLowerCase()] || 'inherit'}; font-weight: bold`,
      'color: inherit',
      bindings
    )
  }
}

const sentryHandlers = {
  /**
   * Sends structured error data to Sentry
   */
  sendToSentry: (level, message, bindings = {}) => {
    if (!isDevelopment) {
      const data = {
        level,
        extra: {
          ...bindings,
          timestamp: new Date().toISOString()
        },
        tags: {
          environment: process.env.NODE_ENV,
          context: isServer ? 'server' : 'browser'
        }
      }

      if (message instanceof Error) {
        Sentry.captureException(message, data)
      } else if (typeof message === 'object' && message !== null) {
        const { error, ...context } = message
        Sentry.captureMessage(error || 'An error occurred', {
          ...data,
          extra: { ...data.extra, ...context }
        })
      } else {
        Sentry.captureMessage(String(message), data)
      }
    }
  }
}

const devConfig = {
  browser: {
    asObject: true,
    transmit: {
      send: (level, logEvent) => {
        const { messages = [], bindings = {} } = logEvent
        formatters.formatConsole(level, messages[0], bindings)
      }
    }
  },
  level: 'trace',
  serializers
}

const prodConfig = {
  browser: {
    asObject: true,
    transmit: {
      level: 'warn',
      send: (level, logEvent) => {
        const { messages = [], bindings = {} } = logEvent
        const message = messages[0]
        
        console[level](`[${formatters.formatLevel(level)}] ${typeof message === 'object' ? JSON.stringify(message) : message}`)
        
        if (['warn', 'error', 'fatal'].includes(level)) {
          sentryHandlers.sendToSentry(level, message, bindings)
        }
      }
    }
  },
  level: 'warn',
  serializers
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