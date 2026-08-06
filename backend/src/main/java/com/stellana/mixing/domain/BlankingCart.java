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

import java.time.LocalDateTime;

@Entity
@Table(name = "blanking_carts", indexes = {
        @Index(name = "idx_blanking_cart_status", columnList = "status"),
        @Index(name = "idx_blanking_cart_destination", columnList = "destination_press_id")
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BlankingCart extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String cartNumber;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "blanking_batch_id", nullable = false)
    private BlankingBatch blankingBatch;

    @Column(nullable = false)
    private String materialCode;

    private String mixingBatchNumber;

    private String itemCode;

    @Column(nullable = false)
    private Integer quantity;

    @Column(nullable = false)
    private Integer remainingQuantity;

    @Column(nullable = false, columnDefinition = "integer default 0")
    @Builder.Default
    private Integer returnedQuantity = 0;

    @Column(precision = 12, scale = 3)
    private java.math.BigDecimal averageBlankWeightGrams;

    @Column(precision = 12, scale = 3)
    private java.math.BigDecimal materialWeightKg;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by_id", nullable = false)
    private UserAccount createdBy;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "destination_press_id", nullable = false)
    private Press destinationPress;

    private LocalDateTime dispatchedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dispatched_by_id")
    private UserAccount dispatchedBy;

    private LocalDateTime heldAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "held_by_id")
    private UserAccount heldBy;

    @Column(length = 1000)
    private String holdReason;

    private LocalDateTime releasedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "released_by_id")
    private UserAccount releasedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(40)")
    private BlankingCartStatus status;

    @Column(length = 1500)
    private String blankingNote;

    @Version
    @Column(nullable = false, columnDefinition = "bigint default 0")
    @Builder.Default
    private Long version = 0L;
}
