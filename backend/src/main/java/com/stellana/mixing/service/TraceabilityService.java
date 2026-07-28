package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.TraceabilityView;
import com.stellana.mixing.domain.LabSample;
import com.stellana.mixing.domain.ProductionBatch;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.LabSampleRepository;
import com.stellana.mixing.repository.ProductionBatchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.stellana.mixing.api.ApiMapper.factoryReference;

@Service
@RequiredArgsConstructor
public class TraceabilityService {
    private final ProductionBatchRepository batchRepository;
    private final LabSampleRepository sampleRepository;

    @Transactional(readOnly = true)
    public TraceabilityView trace(String code) {
        ProductionBatch batch = batchRepository.findByTraceabilityCode(code)
                .orElseThrow(() -> new NotFoundException("Traceability record not found."));
        LabSample sample = sampleRepository.findFirstByBatchIdOrderBySentToLabAtDesc(batch.getId()).orElse(null);
        return new TraceabilityView(
                batch.getBatchNumber(),
                factoryReference(batch),
                batch.getRecipeRevision().getRecipe().getRecipeCode(),
                batch.getRecipeRevision().getRecipe().getCompoundName(),
                batch.getRecipeRevision().getRevisionNumber(),
                batch.getPlannedQuantityKg(),
                batch.getActualOutputQuantityKg(),
                batch.getMachine(),
                batch.getStatus(),
                batch.getLaboratoryStatus(),
                sample == null ? null : sample.getSampleId(),
                sample == null ? null : sample.getTestDateTime(),
                batch.getReleaseStatus(),
                batch.getStage1StartedAt(),
                batch.getStage1CompletedAt(),
                batch.getStage2StartedAt(),
                batch.getStage2CompletedAt()
        );
    }
}
