package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.service.LabService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/lab")
@RequiredArgsConstructor
public class LabController {
    private final LabService labService;

    @GetMapping("/samples")
    public List<LabSampleView> list() {
        return labService.list();
    }

    @PostMapping("/batches/{batchId}/send-sample")
    @PreAuthorize("hasAnyRole('MIXING_OFFICER','MANAGER','SYSTEM_ADMIN')")
    public LabSampleView sendSample(@PathVariable Long batchId) {
        return labService.sendSample(batchId);
    }

    @PostMapping("/samples/{sampleId}/results")
    @PreAuthorize("hasAnyRole('MANAGER','SYSTEM_ADMIN','LAB_OFFICER')")
    public LabSampleView record(@PathVariable Long sampleId, @Valid @RequestBody LabResultRequest request) {
        return labService.recordResult(sampleId, request);
    }

    @GetMapping("/specifications")
    public List<TestSpecificationView> specifications() {
        return labService.specifications();
    }

    @PostMapping("/specifications")
    @PreAuthorize("hasAnyRole('MANAGER','SYSTEM_ADMIN')")
    public TestSpecificationView createSpecification(@Valid @RequestBody TestSpecificationRequest request) {
        return labService.createSpecification(request);
    }
}

