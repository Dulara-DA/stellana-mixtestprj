package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.ApprovedMaterialBatchView;
import com.stellana.mixing.api.ApiModels.CompoundStockStatusRequest;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.ApprovedMaterialBatchRepository;
import com.stellana.mixing.repository.LabSampleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

import static com.stellana.mixing.api.ApiMapper.approvedMaterialBatch;

@Service
@RequiredArgsConstructor
public class ApprovedMaterialService {
    private final ApprovedMaterialBatchRepository approvedMaterialBatchRepository;
    private final LabSampleRepository labSampleRepository;
    private final AuditService auditService;
    private final RealtimeEventService realtimeEventService;
    private final ShiftService shiftService;
    private final InventoryLedgerService inventoryLedgerService;
    private final CurrentUserService currentUserService;

    @Transactional(readOnly = true)
    public List<ApprovedMaterialBatchView> list() {
        return approvedMaterialBatchRepository.findAllByOrderByApprovedAtDesc().stream()
                .map(com.stellana.mixing.api.ApiMapper::approvedMaterialBatch)
                .toList();
    }

    @Transactional
    public ApprovedMaterialBatch createFromReleasedMixingBatch(ProductionBatch batch, UserAccount actor) {
        if (batch.getLaboratoryStatus() != LabDecision.PASS
                || batch.getReleaseStatus() != ReleaseStatus.APPROVED_FOR_BLANKING) {
            throw new BusinessRuleException("Only a passed and released Mixing batch can enter Blanking.");
        }
        return approvedMaterialBatchRepository.findByMixingBatchNumberIgnoreCase(batch.getBatchNumber())
                .orElseGet(() -> {
                    LabSample labApproval = labSampleRepository.findFirstByBatchIdOrderBySentToLabAtDesc(batch.getId())
                            .filter(sample -> sample.getDecision() == LabDecision.PASS)
                            .orElse(null);
                    BigDecimal quantity = batch.getActualOutputQuantityKg() == null
                            ? batch.getPlannedQuantityKg()
                            : batch.getActualOutputQuantityKg();
                    ApprovedMaterialBatch saved = approvedMaterialBatchRepository.save(
                            ApprovedMaterialBatch.builder()
                                    .mixingBatch(batch)
                                    .labApproval(labApproval)
                                    .mixingBatchNumber(batch.getBatchNumber())
                                    .materialCode(batch.getRecipeRevision().getRecipe().getRecipeCode())
                                    .compoundName(batch.getRecipeRevision().getRecipe().getCompoundName())
                                    .labStatus(LabDecision.PASS)
                                    .approvedQuantityKg(quantity)
                                    .availableQuantityKg(quantity)
                                    .plannedQuantityKg(batch.getPlannedQuantityKg())
                                    .receivedQuantityKg(quantity)
                                    .reservedQuantityKg(BigDecimal.ZERO)
                                    .consumedQuantityKg(BigDecimal.ZERO)
                                    .returnedQuantityKg(BigDecimal.ZERO)
                                    .approvedAt(labApproval != null && labApproval.getTestDateTime() != null
                                            ? labApproval.getTestDateTime()
                                            : shiftService.now())
                                    .receivedAt(shiftService.now())
                                    .receivingOperator(actor)
                                    .stockStatus(CompoundStockStatus.AVAILABLE)
                                    .notes("Automatically created from the passed Mixing/Lab release.")
                                    .active(true)
                                    .build());
                    inventoryLedgerService.record(
                            InventoryTransactionType.COMPOUND_RECEIVED,
                            ProductionSection.MIXING,
                            ProductionSection.BLANKING,
                            "ProductionBatch",
                            batch.getId(),
                            "ApprovedMaterialBatch",
                            saved.getId(),
                            quantity,
                            "kg",
                            quantity,
                            actor,
                            "Lab PASS and Manager release for Blanking");
                    auditService.record(actor, "APPROVE_MATERIAL_FOR_BLANKING", "ApprovedMaterialBatch",
                            saved.getId(), null,
                            saved.getMixingBatchNumber() + " / " + quantity + " kg",
                            batch.getId(), batch.getRecipeRevision().getRecipe().getId());
                    realtimeEventService.productionChanged("BLANKING", "MATERIAL_BATCH_APPROVED", saved.getId(),
                            saved.getMixingBatchNumber() + " is available to Blanking");
                    return saved;
                });
    }

    public ApprovedMaterialBatchView view(ApprovedMaterialBatch value) {
        return approvedMaterialBatch(value);
    }

    @Transactional
    public ApprovedMaterialBatchView changeStatus(Long id, CompoundStockStatusRequest request) {
        UserAccount actor = currentUser();
        ApprovedMaterialBatch value = approvedMaterialBatchRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new NotFoundException("Compound stock record not found."));
        if (request.status() == CompoundStockStatus.AWAITING_RECEIPT
                || request.status() == CompoundStockStatus.DEPLETED) {
            throw new BusinessRuleException(
                    "Awaiting receipt and depleted states are controlled by stock quantities.");
        }
        if (request.status() == CompoundStockStatus.AVAILABLE
                || request.status() == CompoundStockStatus.PARTIALLY_USED) {
            if (value.getAvailableQuantityKg().signum() <= 0) {
                throw new BusinessRuleException("A zero-balance stock record cannot be made available.");
            }
            request = new CompoundStockStatusRequest(
                    value.getAvailableQuantityKg().compareTo(
                            value.getReceivedQuantityKg() == null
                                    ? value.getApprovedQuantityKg() : value.getReceivedQuantityKg()) >= 0
                            ? CompoundStockStatus.AVAILABLE : CompoundStockStatus.PARTIALLY_USED,
                    request.reason());
        }
        CompoundStockStatus previous = value.getStockStatus() == null
                ? CompoundStockStatus.AVAILABLE : value.getStockStatus();
        value.setStockStatus(request.status());
        value.setActive(request.status() != CompoundStockStatus.REJECTED);
        value.setNotes(append(value.getNotes(), "Status " + request.status()
                + ": " + request.reason().trim()));
        ApprovedMaterialBatch saved = approvedMaterialBatchRepository.save(value);
        inventoryLedgerService.record(
                InventoryTransactionType.INVENTORY_CORRECTION,
                ProductionSection.BLANKING,
                ProductionSection.BLANKING,
                "ApprovedMaterialBatch",
                saved.getId(),
                "ApprovedMaterialBatch",
                saved.getId(),
                BigDecimal.ZERO,
                "kg",
                BigDecimal.ZERO,
                actor,
                "Status " + previous + " → " + saved.getStockStatus()
                        + " / " + request.reason().trim());
        auditService.record(actor, "CHANGE_COMPOUND_STOCK_STATUS", "ApprovedMaterialBatch",
                saved.getId(), previous.name(), saved.getStockStatus().name()
                        + " / " + request.reason().trim(),
                saved.getMixingBatch() == null ? null : saved.getMixingBatch().getId(), null);
        realtimeEventService.productionChanged("BLANKING", "COMPOUND_STOCK_STATUS_CHANGED",
                saved.getId(), saved.getMixingBatchNumber() + " is " + saved.getStockStatus());
        return approvedMaterialBatch(saved);
    }

    private UserAccount currentUser() {
        // The authenticated actor is required by the controller and resolved
        // here through the same service used by all operational commands.
        return currentUserService.requireCurrentUser();
    }

    private String append(String existing, String line) {
        return existing == null || existing.isBlank() ? line : existing + "\n" + line;
    }
}
