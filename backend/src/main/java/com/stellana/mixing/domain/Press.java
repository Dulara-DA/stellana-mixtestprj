package com.stellana.mixing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
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
@Table(name = "presses")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Press extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String pressNumber;

    @Column(nullable = false)
    private String pressName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PressStatus status;

    @Column(nullable = false)
    @Builder.Default
    private Integer availableBlankQuantity = 0;

    @Column(nullable = false)
    @Builder.Default
    private Integer goodTyreQuantity = 0;

    @Column(nullable = false)
    @Builder.Default
    private Integer rejectedTyreQuantity = 0;

    @Column(nullable = false)
    @Builder.Default
    private Integer rejectedBlankQuantity = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_operator_id")
    private UserAccount currentOperator;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_blanking_batch_id")
    private BlankingBatch currentBlankingBatch;

    @Column(length = 100)
    private String currentItemCode;

    private LocalDateTime lastActivityAt;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Version
    @Column(nullable = false, columnDefinition = "bigint default 0")
    @Builder.Default
    private Long version = 0L;
}
