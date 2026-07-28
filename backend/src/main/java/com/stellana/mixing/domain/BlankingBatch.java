package com.stellana.mixing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "blanking_batches", indexes = {
        @Index(name = "idx_blanking_batch_production_date", columnList = "production_date"),
        @Index(name = "idx_blanking_batch_material", columnList = "material_code")
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BlankingBatch extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String batchNumber;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "approved_material_batch_id", nullable = false)
    private ApprovedMaterialBatch approvedMaterialBatch;

    @Column(nullable = false)
    private String mixingBatchNumber;

    @Column(nullable = false)
    private String materialCode;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal materialConsumedKg;

    @Column(nullable = false)
    private Integer plannedProductionQuantity;

    private Integer productionQuantity;

    @Column(nullable = false)
    @Builder.Default
    private Integer rejectedQuantity = 0;

    @Column(nullable = false)
    @Builder.Default
    private Integer availableGoodBlankQuantity = 0;

    @Column(nullable = false)
    private LocalDate productionDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductionShift shift;

    private LocalDateTime startTime;
    private LocalDateTime endTime;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "operator_id", nullable = false)
    private UserAccount operator;

    @Column(nullable = false)
    private String operatorEmployeeId;

    @Column(length = 1500)
    private String notes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BlankingBatchStatus status;
}
