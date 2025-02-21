type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private readonly maxLogs = 1000;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private log(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: data ? this.sanitizeData(data) : undefined
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Also log to console with appropriate styling
    const styles = {
      debug: 'color: #666',
      info: 'color: #0284c7',
      warn: 'color: #ca8a04',
      error: 'color: #dc2626'
    };

    console.log(
      `%c[${entry.timestamp}] [${level.toUpperCase()}] ${message}`,
      styles[level]
    );
    if (data) console.log(data);
  }

  private sanitizeData(data: any): any {
    if (!data) return data;
    
    // Remove sensitive information
    const sensitiveKeys = ['privateKey', 'secret', 'password', 'apiKey'];
    
    if (typeof data === 'object') {
      const sanitized = { ...data };
      for (const key of sensitiveKeys) {
        if (key in sanitized) {
          sanitized[key] = '[REDACTED]';
        }
      }
      return sanitized;
    }
    
    return data;
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data);
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, data?: any) {
    this.log('error', message, data);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  clearLogs() {
    this.logs = [];
  }
}

export const logger = Logger.getInstance();