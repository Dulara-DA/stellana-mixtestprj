package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.service.ApprovedMaterialService;
import com.stellana.mixing.service.BlankingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/blanking")
@RequiredArgsConstructor
public class BlankingController {
    private final ApprovedMaterialService approvedMaterialService;
    private final BlankingService blankingService;

    @GetMapping("/approved-materials")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<ApprovedMaterialBatchView> approvedMaterials() {
        return approvedMaterialService.list();
    }

    @GetMapping("/batches")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<BlankingBatchView> batches() {
        return blankingService.listBatches();
    }

    @PostMapping("/batches")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','SYSTEM_ADMIN')")
    public BlankingBatchView createBatch(@Valid @RequestBody CreateBlankingBatchRequest request) {
        return blankingService.createBatch(request);
    }

    @PostMapping("/batches/{id}/start")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','SYSTEM_ADMIN')")
    public BlankingBatchView startBatch(@PathVariable Long id) {
        return blankingService.startBatch(id);
    }

    @PostMapping("/batches/{id}/complete")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','SYSTEM_ADMIN')")
    public BlankingBatchView completeBatch(
            @PathVariable Long id,
            @Valid @RequestBody CompleteBlankingBatchRequest request
    ) {
        return blankingService.completeBatch(id, request);
    }

    @GetMapping("/carts")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','MOULDING_OPERATOR',"
            + "'MOULDING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<BlankingCartView> carts() {
        return blankingService.listCarts();
    }

    @PostMapping("/carts")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','SYSTEM_ADMIN')")
    public BlankingCartView createCart(@Valid @RequestBody CreateBlankingCartRequest request) {
        return blankingService.createCart(request);
    }

    @PostMapping("/carts/{id}/dispatch")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','SYSTEM_ADMIN')")
    public BlankingCartView dispatchCart(
            @PathVariable Long id,
            @RequestBody(required = false) DispatchCartRequest request
    ) {
        return blankingService.dispatchCart(id, request == null ? new DispatchCartRequest(null) : request);
    }
}
