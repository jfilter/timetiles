/**
 * Schedule Service
 *
 * This service manages the periodic execution of the schedule manager job.
 * It ensures that scheduled imports are checked regularly and executed when due.
 */

import type { Payload } from "payload";

import { logError, logger } from "@/lib/logger";

interface ScheduleServiceConfig {
  intervalMs?: number; // How often to run the schedule manager (default: 60000ms = 1 minute)
  enabled?: boolean; // Whether the service is enabled (default: true)
}

export class ScheduleService {
  private readonly payload: Payload;
  private readonly config: Required<ScheduleServiceConfig>;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isShuttingDown = false;

  constructor(payload: Payload, config: ScheduleServiceConfig = {}) {
    this.payload = payload;
    this.config = {
      intervalMs: config.intervalMs ?? 60000, // Default: check every minute
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Starts the schedule service
   */
  start(): void {
    if (this.intervalId || !this.config.enabled) {
      logger.warn("Schedule service already running or disabled", {
        isRunning: !!this.intervalId,
        enabled: this.config.enabled,
      });
      return;
    }

    logger.info("Starting schedule service", {
      intervalMs: this.config.intervalMs,
    });

    // Run immediately, then at intervals
    this.runScheduleManager();

    this.intervalId = setInterval(() => {
      if (!this.isShuttingDown) {
        this.runScheduleManager();
      }
    }, this.config.intervalMs);

    // Handle process signals for graceful shutdown
    process.on("SIGINT", () => this.stop());
    process.on("SIGTERM", () => this.stop());
  }

  /**
   * Stops the schedule service
   */
  stop(): void {
    if (!this.intervalId) {
      return;
    }

    logger.info("Stopping schedule service");
    this.isShuttingDown = true;

    clearInterval(this.intervalId);
    this.intervalId = null;

    // Wait for current execution to finish
    const waitForStop = () => {
      if (this.isRunning) {
        setTimeout(waitForStop, 100);
      } else {
        logger.info("Schedule service stopped");
      }
    };
    waitForStop();
  }

  /**
   * Manually trigger the schedule manager
   */
  async triggerScheduleManager(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Schedule manager already running, skipping manual trigger");
      return;
    }

    await this.runScheduleManager();
  }

  /**
   * Gets the current status of the schedule service
   */
  getStatus(): {
    isRunning: boolean;
    isActive: boolean;
    config: Required<ScheduleServiceConfig>;
  } {
    return {
      isRunning: this.isRunning,
      isActive: !!this.intervalId,
      config: this.config,
    };
  }

  /**
   * Runs the schedule manager job
   */
  private async runScheduleManager(): Promise<void> {
    if (this.isRunning || this.isShuttingDown) {
      logger.debug("Schedule manager already running or shutting down, skipping");
      return;
    }

    this.isRunning = true;

    try {
      logger.debug("Running schedule manager");

      const job = await this.payload.jobs.queue({
        task: "schedule-manager",
        input: {}, // No input needed
      });

      logger.debug("Schedule manager job queued", { jobId: job.id });
    } catch (error) {
      logError(error, "Failed to queue schedule manager job");
    } finally {
      this.isRunning = false;
    }
  }
}

// Singleton instance
let scheduleServiceInstance: ScheduleService | null = null;

/**
 * Gets or creates the schedule service instance
 */
export const getScheduleService = (payload: Payload, config?: ScheduleServiceConfig): ScheduleService => {
  if (!scheduleServiceInstance) {
    scheduleServiceInstance = new ScheduleService(payload, config);
  }
  return scheduleServiceInstance;
};

/**
 * Starts the schedule service with the given Payload instance
 */
export const startScheduleService = (payload: Payload, config?: ScheduleServiceConfig): ScheduleService => {
  const service = getScheduleService(payload, config);
  service.start();
  return service;
};

/**
 * Stops the schedule service
 */
export const stopScheduleService = (): void => {
  if (scheduleServiceInstance) {
    scheduleServiceInstance.stop();
    scheduleServiceInstance = null;
  }
};
