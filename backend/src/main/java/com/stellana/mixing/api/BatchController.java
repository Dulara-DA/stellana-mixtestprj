package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.service.BatchService;
import com.stellana.mixing.service.QrCodeService;
import com.stellana.mixing.service.TraceabilityService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class BatchController {
    private final BatchService batchService;
    private final QrCodeService qrCodeService;
    private final TraceabilityService traceabilityService;

    @GetMapping("/api/batches")
    public List<BatchView> list() {
        return batchService.list();
    }

    @GetMapping("/api/batches/{id}")
    public BatchView get(@PathVariable Long id) {
        return batchService.get(id);
    }

    @PostMapping("/api/batches")
    @PreAuthorize("hasAnyRole('MANAGER','MIXING_OFFICER','SYSTEM_ADMIN')")
    public BatchView create(@Valid @RequestBody CreateBatchRequest request) {
        return batchService.create(request);
    }

    @PostMapping("/api/batches/{id}/transition")
    public BatchView transition(@PathVariable Long id, @Valid @RequestBody BatchTransitionRequest request) {
        return batchService.transition(id, request);
    }

    @GetMapping("/api/batches/{id}/history")
    public List<StatusHistoryView> history(@PathVariable Long id) {
        return batchService.history(id);
    }

    @GetMapping(value = "/api/batches/{id}/qr", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> qr(@PathVariable Long id) {
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(qrCodeService.generateForBatch(id));
    }

    @GetMapping("/api/public/trace/{code}")
    public TraceabilityView trace(@PathVariable String code) {
        return traceabilityService.trace(code);
    }
}
