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
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "approved_material_batches", indexes = {
        @Index(name = "idx_approved_material_mixing_batch", columnList = "mixing_batch_number"),
        @Index(name = "idx_approved_material_code", columnList = "material_code")
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApprovedMaterialBatch extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "mixing_batch_id")
    private ProductionBatch mixingBatch;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lab_approval_id")
    private LabSample labApproval;

    @Column(name = "mixing_batch_number", nullable = false, unique = true)
    private String mixingBatchNumber;

    @Column(name = "material_code", nullable = false)
    private String materialCode;

    @Column(nullable = false)
    private String compoundName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LabDecision labStatus;

    @Column(nullable = false, precision = 12, scale = 3, columnDefinition = "numeric(12,3) default 0")
    private BigDecimal approvedQuantityKg;

    @Column(nullable = false, precision = 12, scale = 3, columnDefinition = "numeric(12,3) default 0")
    private BigDecimal availableQuantityKg;

    @Column(precision = 12, scale = 3)
    private BigDecimal plannedQuantityKg;

    @Column(precision = 12, scale = 3)
    private BigDecimal receivedQuantityKg;

    @Column(nullable = false, precision = 12, scale = 3, columnDefinition = "numeric(12,3) default 0")
    @Builder.Default
    private BigDecimal reservedQuantityKg = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 3, columnDefinition = "numeric(12,3) default 0")
    @Builder.Default
    private BigDecimal consumedQuantityKg = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 3, columnDefinition = "numeric(12,3) default 0")
    @Builder.Default
    private BigDecimal returnedQuantityKg = BigDecimal.ZERO;

    @Column(nullable = false)
    private LocalDateTime approvedAt;

    private LocalDateTime receivedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "receiving_operator_id")
    private UserAccount receivingOperator;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(32) default 'AVAILABLE'")
    @Builder.Default
    private CompoundStockStatus stockStatus = CompoundStockStatus.AVAILABLE;

    @Column(length = 1500)
    private String notes;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Version
    @Column(nullable = false, columnDefinition = "bigint default 0")
    @Builder.Default
    private Long version = 0L;
}
