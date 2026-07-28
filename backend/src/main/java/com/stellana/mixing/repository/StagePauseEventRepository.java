package com.stellana.mixing.repository;

import com.stellana.mixing.domain.StagePauseEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface StagePauseEventRepository extends JpaRepository<StagePauseEvent, Long> {
    Optional<StagePauseEvent> findFirstByMixingStageIdAndResumedAtIsNullOrderByPausedAtDesc(Long stageId);
}

