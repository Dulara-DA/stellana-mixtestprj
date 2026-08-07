package com.stellana.mixing.domain;

public enum ScheduleTimingStatus {
    UNSCHEDULED,
    SCHEDULED,
    READY_TO_START,
    IN_PROGRESS,
    DUE_SOON,
    OVERDUE,
    COMPLETED_ON_TIME,
    COMPLETED_LATE,
    CANCELLED
}
