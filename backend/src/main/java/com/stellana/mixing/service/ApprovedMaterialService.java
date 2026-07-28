package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.ApprovedMaterialBatchView;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
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
                                    .approvedAt(labApproval != null && labApproval.getTestDateTime() != null
                                            ? labApproval.getTestDateTime()
                                            : shiftService.now())
                                    .notes("Automatically created from the passed Mixing/Lab release.")
                                    .active(true)
                                    .build());
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
}
