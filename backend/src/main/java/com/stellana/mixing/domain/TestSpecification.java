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
@Table(name = "test_specifications")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TestSpecification extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipe_id")
    private Recipe recipe;

    @Column(nullable = false)
    private String testName;

    private BigDecimal minimumValue;
    private BigDecimal maximumValue;
    private String unit;

    @Column(length = 1000)
    private String notes;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}

