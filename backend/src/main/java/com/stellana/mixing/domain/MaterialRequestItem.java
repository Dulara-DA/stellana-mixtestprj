package com.stellana.mixing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

@Entity
@Table(name = "material_request_items")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MaterialRequestItem extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "material_request_id", nullable = false)
    private MaterialRequest materialRequest;

    @Column(nullable = false)
    private String materialCode;

    @Column(nullable = false)
    private String materialName;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal requiredQuantity;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal requestedQuantity;

    @Column(nullable = false, precision = 12, scale = 3)
    @Builder.Default
    private BigDecimal issuedQuantity = BigDecimal.ZERO;

    @Column(nullable = false)
    private String unit;

    private String rawMaterialLotNumber;
}

