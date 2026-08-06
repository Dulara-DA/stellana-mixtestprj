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

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "cart_receipts")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CartReceipt extends BaseEntity {
    @Column(unique = true)
    private String receiptNumber;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cart_id", nullable = false, unique = true)
    private BlankingCart cart;

    @Column(nullable = false)
    private Integer receivedQuantity;

    @Column(nullable = false)
    private LocalDate productionDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductionShift shift;

    @Column(nullable = false)
    private LocalDateTime receivedAt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receiving_operator_id", nullable = false)
    private UserAccount receivingOperator;

    @Column(nullable = false)
    private String receivingOperatorEmployeeId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "press_id", nullable = false)
    private Press press;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sending_operator_id", nullable = false)
    private UserAccount sendingOperator;

    @Column(nullable = false)
    private LocalDateTime dispatchTime;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CartReceiptStatus receiptStatus;

    @Column(length = 1000)
    private String overrideReason;
}
