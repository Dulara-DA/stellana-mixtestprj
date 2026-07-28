package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.service.MaterialRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/material-requests")
@RequiredArgsConstructor
public class MaterialRequestController {
    private final MaterialRequestService requestService;

    @GetMapping
    public List<MaterialRequestView> list() {
        return requestService.list();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('MIXING_OFFICER','MANAGER','SYSTEM_ADMIN')")
    public MaterialRequestView create(@Valid @RequestBody CreateMaterialRequest request) {
        return requestService.create(request);
    }

    @PostMapping("/{id}/issue")
    @PreAuthorize("hasAnyRole('MANAGER','SYSTEM_ADMIN','STORES_OFFICER')")
    public MaterialRequestView issue(@PathVariable Long id, @Valid @RequestBody IssueMaterialsRequest request) {
        return requestService.issue(id, request);
    }
}

