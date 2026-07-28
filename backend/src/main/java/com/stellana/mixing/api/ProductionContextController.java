package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.ShiftContextView;
import com.stellana.mixing.service.ShiftService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/production")
@RequiredArgsConstructor
public class ProductionContextController {
    private final ShiftService shiftService;

    @GetMapping("/shift")
    public ShiftContextView currentShift() {
        ShiftService.ShiftContext value = shiftService.current();
        return new ShiftContextView(
                value.productionDate(),
                value.shift(),
                value.serverTime(),
                value.shiftStart(),
                value.shiftEnd());
    }
}
