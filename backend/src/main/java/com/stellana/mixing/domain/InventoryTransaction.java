package com.stellana.mixing.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "inventory_transactions", indexes = {
        @Index(name = "idx_inventory_transaction_time", columnList = "transaction_time"),
        @Index(name = "idx_inventory_transaction_source", columnList = "source_record_type,source_record_id"),
        @Index(name = "idx_inventory_transaction_destination", columnList = "destination_record_type,destination_record_id")
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryTransaction extends BaseEntity {
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InventoryTransactionType transactionType;

    @Enumerated(EnumType.STRING)
    private ProductionSection sourceSection;

    @Enumerated(EnumType.STRING)
    private ProductionSection destinationSection;

    private String sourceRecordType;
    private Long sourceRecordId;
    private String destinationRecordType;
    private Long destinationRecordId;

    @Column(nullable = false, precision = 16, scale = 3)
    private BigDecimal quantity;

    @Column(nullable = false)
    private String unit;

    @Column(precision = 16, scale = 3)
    private BigDecimal weightKg;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "actor_id", nullable = false)
    private UserAccount actor;

    @Column(nullable = false)
    private LocalDateTime transactionTime;

    @Column(length = 1500)
    private String reasonReference;
}
