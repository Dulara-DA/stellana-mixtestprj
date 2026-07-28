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
@Table(name = "recipe_ingredients")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecipeIngredient extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipe_revision_id", nullable = false)
    private RecipeRevision recipeRevision;

    @Column(nullable = false)
    private String materialCode;

    @Column(nullable = false)
    private String materialName;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal requiredQuantity;

    @Column(nullable = false)
    private String unit;

    @Column(nullable = false)
    private Integer additionSequence;

    @Column(nullable = false)
    private Integer stageNumber;

    private Integer mixingTimeSeconds;
    private BigDecimal temperatureCelsius;
    private BigDecimal speedRpm;

    @Column(length = 1000)
    private String instructions;
}

