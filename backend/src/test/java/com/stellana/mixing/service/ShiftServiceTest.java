package com.stellana.mixing.service;

import com.stellana.mixing.domain.ProductionShift;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class ShiftServiceTest {
    private final ShiftService shiftService = new ShiftService("Asia/Colombo");

    @Test
    void calculatesAllShiftBoundariesUsingFactoryTime() {
        LocalDate day = LocalDate.of(2026, 7, 28);

        assertShift(day.atTime(6, 0), ProductionShift.SHIFT_A, day);
        assertShift(day.atTime(13, 59, 59), ProductionShift.SHIFT_A, day);
        assertShift(day.atTime(14, 0), ProductionShift.SHIFT_B, day);
        assertShift(day.atTime(21, 59, 59), ProductionShift.SHIFT_B, day);
        assertShift(day.atTime(22, 0), ProductionShift.SHIFT_C, day);
        assertShift(day.atTime(23, 59, 59), ProductionShift.SHIFT_C, day);
    }

    @Test
    void assignsAfterMidnightShiftCActivityToPreviousProductionDate() {
        LocalDate calendarDate = LocalDate.of(2026, 7, 29);
        ShiftService.ShiftContext context = shiftService.calculate(calendarDate.atTime(2, 30));

        assertThat(context.shift()).isEqualTo(ProductionShift.SHIFT_C);
        assertThat(context.productionDate()).isEqualTo(LocalDate.of(2026, 7, 28));
        assertThat(context.shiftStart()).isEqualTo(LocalDateTime.of(2026, 7, 28, 22, 0));
        assertThat(context.shiftEnd()).isEqualTo(LocalDateTime.of(2026, 7, 29, 6, 0));
    }

    private void assertShift(LocalDateTime time, ProductionShift expected, LocalDate productionDate) {
        ShiftService.ShiftContext context = shiftService.calculate(time);
        assertThat(context.shift()).isEqualTo(expected);
        assertThat(context.productionDate()).isEqualTo(productionDate);
    }
}
