package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.service.ApprovedMaterialService;
import com.stellana.mixing.service.BlankingService;
import com.stellana.mixing.service.InventoryLedgerService;
import com.stellana.mixing.service.BlankReturnService;
import com.stellana.mixing.service.ProductionManagerService;
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
    private final InventoryLedgerService inventoryLedgerService;
    private final BlankReturnService blankReturnService;
    private final ProductionManagerService productionManagerService;

    @GetMapping("/approved-materials")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<ApprovedMaterialBatchView> approvedMaterials() {
        return approvedMaterialService.list();
    }

    @GetMapping("/compound-stock")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<ApprovedMaterialBatchView> compoundStock() {
        return approvedMaterialService.list();
    }

    @GetMapping("/compound-stock/distribution")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public ProductionGenealogyView compoundStockDistribution(
            @RequestParam String mixingBatchNumber
    ) {
        return productionManagerService.genealogy(mixingBatchNumber);
    }

    @PostMapping("/compound-stock/sync-passed")
    @PreAuthorize("hasAnyRole('MANAGER','SYSTEM_ADMIN')")
    public List<ApprovedMaterialBatchView> synchronizePassedCompoundStock() {
        return approvedMaterialService.synchronizePassedBatches();
    }

    @PatchMapping("/compound-stock/{id}/status")
    @PreAuthorize("hasAnyRole('BLANKING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public ApprovedMaterialBatchView changeCompoundStockStatus(
            @PathVariable Long id,
            @Valid @RequestBody CompoundStockStatusRequest request
    ) {
        return approvedMaterialService.changeStatus(id, request);
    }

    @PatchMapping("/compound-stock/{id}/receipt")
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public ApprovedMaterialBatchView updateCompoundReceipt(
            @PathVariable Long id,
            @Valid @RequestBody UpdateCompoundReceiptRequest request
    ) {
        return approvedMaterialService.updateReceipt(id, request);
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

    @PostMapping("/production-records")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','SYSTEM_ADMIN')")
    public BlankingProductionRecordView createProductionRecord(
            @Valid @RequestBody CreateBlankingProductionRecordRequest request
    ) {
        return blankingService.createProductionRecord(request);
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

    @PatchMapping("/batches/{id}/correct")
    @PreAuthorize("hasAnyRole('BLANKING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public BlankingBatchView correctBatch(
            @PathVariable Long id,
            @Valid @RequestBody CorrectBlankingBatchRequest request
    ) {
        return blankingService.correctBatch(id, request);
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

    @PostMapping("/carts/{id}/hold")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','SYSTEM_ADMIN')")
    public BlankingCartView holdCart(@PathVariable Long id, @Valid @RequestBody HoldCartRequest request) {
        return blankingService.holdCart(id, request);
    }

    @PostMapping("/carts/{id}/release")
    @PreAuthorize("hasAnyRole('BLANKING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public BlankingCartView releaseCart(
            @PathVariable Long id,
            @RequestBody(required = false) ReleaseCartRequest request
    ) {
        return blankingService.releaseCart(id, request == null ? new ReleaseCartRequest(null) : request);
    }

    @GetMapping("/inventory-transactions")
    @PreAuthorize("hasAnyRole('BLANKING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<InventoryTransactionView> inventoryTransactions() {
        return inventoryLedgerService.recent();
    }

    @GetMapping("/returns")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<BlankReturnView> returns() {
        return blankReturnService.list();
    }

    @PostMapping("/returns/{id}/confirm")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','SYSTEM_ADMIN')")
    public BlankReturnView confirmReturn(
            @PathVariable Long id,
            @Valid @RequestBody ConfirmBlankReturnRequest request
    ) {
        return blankReturnService.confirm(id, request);
    }
}
