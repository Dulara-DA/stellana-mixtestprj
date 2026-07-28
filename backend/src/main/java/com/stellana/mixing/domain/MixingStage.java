package com.stellana.mixing.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "mixing_stages",
        uniqueConstraints = @UniqueConstraint(columnNames = {"batch_id", "stage_number"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MixingStage extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "batch_id", nullable = false)
    private ProductionBatch batch;

    @Column(nullable = false)
    private Integer stageNumber;

    private LocalDateTime startTime;
    private LocalDateTime endTime;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "officer_id", nullable = false)
    private UserAccount officer;

    @Column(nullable = false)
    private String machine;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal plannedQuantity;

    @Column(precision = 12, scale = 3)
    private BigDecimal actualQuantity;

    @Column(precision = 8, scale = 2)
    private BigDecimal temperatureCelsius;

    private Integer mixingTimeSeconds;

    @Column(precision = 10, scale = 2)
    private BigDecimal speedRpm;

    @Column(length = 1500)
    private String notes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StageCompletionStatus completionStatus;

    @Column(nullable = false)
    @Builder.Default
    private boolean managerOverride = false;

    @Column(length = 1000)
    private String overrideReason;

    @OneToMany(mappedBy = "mixingStage", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<StagePauseEvent> pauseEvents = new ArrayList<>();
}

