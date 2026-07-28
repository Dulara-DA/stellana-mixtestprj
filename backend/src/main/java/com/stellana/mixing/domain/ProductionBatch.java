package com.stellana.mixing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "production_batches")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProductionBatch extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String batchNumber;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipe_revision_id", nullable = false)
    private RecipeRevision recipeRevision;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal plannedQuantityKg;

    @Column(precision = 12, scale = 3)
    private BigDecimal actualOutputQuantityKg;

    @Column(nullable = false)
    private String machine;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assigned_officer_id", nullable = false)
    private UserAccount assignedOfficer;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BatchStatus status;

    @Column(nullable = false)
    @Builder.Default
    private Integer currentStage = 0;

    @Column(length = 1000)
    private String issueOrStoppageReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reprocessing_source_batch_id")
    private ProductionBatch reprocessingSourceBatch;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private LabDecision laboratoryStatus = LabDecision.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private ReleaseStatus releaseStatus = ReleaseStatus.NOT_READY;

    @Column(nullable = false, unique = true)
    private String traceabilityCode;

    private LocalDateTime stage1StartedAt;
    private LocalDateTime stage1CompletedAt;
    private LocalDateTime stage2StartedAt;
    private LocalDateTime stage2CompletedAt;
}

