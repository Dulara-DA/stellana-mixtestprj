package com.stellana.mixing.service;

import com.stellana.mixing.domain.ProductionShift;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;

@Service
public class ShiftService {
    private static final LocalTime SHIFT_A_START = LocalTime.of(6, 0);
    private static final LocalTime SHIFT_B_START = LocalTime.of(14, 0);
    private static final LocalTime SHIFT_C_START = LocalTime.of(22, 0);

    private final ZoneId zoneId;

    public ShiftService(@Value("${app.time-zone:Asia/Colombo}") String timeZone) {
        this.zoneId = ZoneId.of(timeZone);
    }

    public ShiftContext current() {
        return calculate(LocalDateTime.now(zoneId));
    }

    public LocalDateTime now() {
        return LocalDateTime.now(zoneId);
    }

    public ShiftContext calculate(LocalDateTime serverTime) {
        LocalTime time = serverTime.toLocalTime();
        ProductionShift shift;
        LocalDate productionDate = serverTime.toLocalDate();
        LocalDateTime shiftStart;
        LocalDateTime shiftEnd;

        if (!time.isBefore(SHIFT_A_START) && time.isBefore(SHIFT_B_START)) {
            shift = ProductionShift.SHIFT_A;
            shiftStart = productionDate.atTime(SHIFT_A_START);
            shiftEnd = productionDate.atTime(SHIFT_B_START);
        } else if (!time.isBefore(SHIFT_B_START) && time.isBefore(SHIFT_C_START)) {
            shift = ProductionShift.SHIFT_B;
            shiftStart = productionDate.atTime(SHIFT_B_START);
            shiftEnd = productionDate.atTime(SHIFT_C_START);
        } else {
            shift = ProductionShift.SHIFT_C;
            if (time.isBefore(SHIFT_A_START)) {
                productionDate = productionDate.minusDays(1);
            }
            shiftStart = productionDate.atTime(SHIFT_C_START);
            shiftEnd = productionDate.plusDays(1).atTime(SHIFT_A_START);
        }
        return new ShiftContext(productionDate, shift, serverTime, shiftStart, shiftEnd);
    }

    public record ShiftContext(
            LocalDate productionDate,
            ProductionShift shift,
            LocalDateTime serverTime,
            LocalDateTime shiftStart,
            LocalDateTime shiftEnd
    ) {}
}
