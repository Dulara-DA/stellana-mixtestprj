package com.stellana.mixing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "recipes")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Recipe extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String recipeCode;

    @Column(nullable = false)
    private String compoundName;

    @Column(nullable = false)
    @Builder.Default
    private boolean archived = false;
}

