package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.service.MixingStageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/stages")
@RequiredArgsConstructor
public class MixingStageController {
    private final MixingStageService stageService;

    @GetMapping("/batch/{batchId}")
    public List<StageView> forBatch(@PathVariable Long batchId) {
        return stageService.forBatch(batchId);
    }

    @PostMapping("/start")
    @PreAuthorize("hasAnyRole('MIXING_OFFICER','MANAGER','SYSTEM_ADMIN')")
    public StageView start(@Valid @RequestBody StartStageRequest request) {
        return stageService.start(request);
    }

    @PostMapping("/{id}/pause")
    @PreAuthorize("hasAnyRole('MIXING_OFFICER','MANAGER','SYSTEM_ADMIN')")
    public StageView pause(@PathVariable Long id, @Valid @RequestBody PauseStageRequest request) {
        return stageService.pause(id, request);
    }

    @PostMapping("/{id}/resume")
    @PreAuthorize("hasAnyRole('MIXING_OFFICER','MANAGER','SYSTEM_ADMIN')")
    public StageView resume(@PathVariable Long id) {
        return stageService.resume(id);
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("hasAnyRole('MIXING_OFFICER','MANAGER','SYSTEM_ADMIN')")
    public StageView complete(@PathVariable Long id, @Valid @RequestBody StageCompleteRequest request) {
        return stageService.complete(id, request);
    }
}

