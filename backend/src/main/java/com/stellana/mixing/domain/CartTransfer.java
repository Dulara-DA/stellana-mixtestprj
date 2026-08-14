package com.stellana.mixing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "cart_transfers")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CartTransfer extends BaseEntity {
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cart_id", nullable = false, unique = true)
    private BlankingCart cart;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductionSection fromSection;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "destination_press_id")
    private Press destinationPress;

    @Column(nullable = false)
    private Integer quantity;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "dispatched_by_id", nullable = false)
    private UserAccount dispatchedBy;

    @Column(nullable = false)
    private LocalDateTime dispatchedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CartTransferStatus status;
}
