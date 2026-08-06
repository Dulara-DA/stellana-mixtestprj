package com.stellana.mixing.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "blank_returns", indexes = {
        @Index(name = "idx_blank_return_status", columnList = "status"),
        @Index(name = "idx_blank_return_cart", columnList = "cart_id")
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BlankReturn extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String returnNumber;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "press_id", nullable = false)
    private Press press;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cart_id", nullable = false)
    private BlankingCart cart;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "blanking_batch_id", nullable = false)
    private BlankingBatch blankingBatch;

    @Column(nullable = false)
    private String compoundCode;

    @Column(nullable = false)
    private String compoundBatchNumber;

    private String itemCode;

    @Column(nullable = false)
    private Integer preparedQuantity;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal measuredReturnWeightKg;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal averageBlankWeightGrams;

    @Column(nullable = false, length = 1000)
    private String returnReason;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sending_operator_id", nullable = false)
    private UserAccount sendingOperator;

    @Column(nullable = false)
    private LocalDateTime sendingDateTime;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductionShift shift;

    @Column(length = 1500)
    private String mouldingNote;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "receiving_operator_id")
    private UserAccount receivingOperator;

    private LocalDateTime receivingDateTime;
    private Integer receivedQuantity;

    @Column(precision = 12, scale = 3)
    private BigDecimal receivedWeightKg;

    private Integer quantityVariance;

    @Column(precision = 12, scale = 3)
    private BigDecimal weightVarianceKg;

    @Column(length = 1500)
    private String varianceNote;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BlankReturnStatus status;

    @Version
    @Column(nullable = false, columnDefinition = "bigint default 0")
    @Builder.Default
    private Long version = 0L;
}
