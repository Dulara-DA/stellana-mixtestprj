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
@Table(name = "moulding_production_records", indexes = {
        @Index(name = "idx_moulding_record_production_date", columnList = "production_date"),
        @Index(name = "idx_moulding_record_press", columnList = "press_id")
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MouldingProductionRecord extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "press_id", nullable = false)
    private Press press;

    @Column(nullable = false)
    private LocalDate productionDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductionShift shift;

    @Column(nullable = false)
    private LocalDateTime startTime;

    private LocalDateTime endTime;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "operator_id", nullable = false)
    private UserAccount operator;

    @Column(nullable = false)
    private String operatorEmployeeId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cart_id", nullable = false)
    private BlankingCart cart;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "blanking_batch_id", nullable = false)
    private BlankingBatch blankingBatch;

    @Column(nullable = false)
    private Integer quantityReceived;

    @Column(nullable = false)
    @Builder.Default
    private Integer goodTyreQuantity = 0;

    @Column(nullable = false)
    @Builder.Default
    private Integer rejectedTyreQuantity = 0;

    @Column(nullable = false, precision = 12, scale = 3)
    @Builder.Default
    private BigDecimal rejectedTyreWeightPerItemGrams = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 3)
    @Builder.Default
    private BigDecimal totalRejectedTyreWeightGrams = BigDecimal.ZERO;

    @Column(nullable = false)
    @Builder.Default
    private Integer rejectedBlankQuantity = 0;

    @Column(nullable = false)
    private Integer remainingBlankQuantity;

    @Column(nullable = false)
    @Builder.Default
    private Integer downtimeMinutes = 0;

    @Column(length = 1000)
    private String downtimeReason;

    @Column(length = 1500)
    private String operatorNote;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MouldingRecordStatus status;
}
