package com.stellana.mixing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "stage_pause_events")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StagePauseEvent extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "mixing_stage_id", nullable = false)
    private MixingStage mixingStage;

    @Column(nullable = false)
    private LocalDateTime pausedAt;

    private LocalDateTime resumedAt;

    @Column(length = 1000)
    private String reason;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recorded_by_id", nullable = false)
    private UserAccount recordedBy;
}

