package com.stellana.mixing.repository;

import com.stellana.mixing.domain.MixingStage;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MixingStageRepository extends JpaRepository<MixingStage, Long> {
    @EntityGraph(attributePaths = {"officer", "pauseEvents", "pauseEvents.recordedBy"})
    List<MixingStage> findAllByBatchIdOrderByStageNumberAsc(Long batchId);

    @EntityGraph(attributePaths = {"batch", "officer", "pauseEvents"})
    Optional<MixingStage> findByBatchIdAndStageNumber(Long batchId, Integer stageNumber);
}

