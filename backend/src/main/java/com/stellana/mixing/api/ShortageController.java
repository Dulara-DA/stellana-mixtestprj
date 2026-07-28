package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.service.ShortageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/shortages")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','MOULDING_OPERATOR',"
        + "'MOULDING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
public class ShortageController {
    private final ShortageService shortageService;

    @GetMapping
    public List<MaterialShortageRequestView> list() {
        return shortageService.list();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('MOULDING_OPERATOR','MOULDING_SUPERVISOR','SYSTEM_ADMIN')")
    public MaterialShortageRequestView create(@Valid @RequestBody CreateShortageRequest request) {
        return shortageService.create(request);
    }

    @PatchMapping("/{id}/status")
    public MaterialShortageRequestView updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody ShortageStatusUpdateRequest request
    ) {
        return shortageService.updateStatus(id, request);
    }

    @PostMapping("/{id}/messages")
    public MaterialShortageRequestView addMessage(
            @PathVariable Long id,
            @Valid @RequestBody ShortageMessageRequest request
    ) {
        return shortageService.addMessage(id, request);
    }
}
