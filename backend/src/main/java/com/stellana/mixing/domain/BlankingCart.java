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

    @Column(nullable = false)
    private Integer quantity;

    @Column(nullable = false)
    private Integer remainingQuantity;

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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BlankingCartStatus status;

    @Column(length = 1500)
    private String blankingNote;
}
