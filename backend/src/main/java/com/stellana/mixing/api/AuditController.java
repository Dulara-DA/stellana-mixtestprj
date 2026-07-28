package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.AuditView;
import com.stellana.mixing.service.AuditService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/audit")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('MANAGER','SYSTEM_ADMIN')")
public class AuditController {
    private final AuditService auditService;

    @GetMapping
    public List<AuditView> recent(@RequestParam(defaultValue = "100") int limit) {
        return auditService.recent(limit);
    }
}
