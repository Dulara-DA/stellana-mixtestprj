package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.DashboardSummary;
import com.stellana.mixing.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {
    private final DashboardService dashboardService;

    @GetMapping
    public DashboardSummary summary() {
        return dashboardService.summary();
    }
}

