package com.stellana.mixing.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "lab_samples")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LabSample extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String sampleId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "batch_id", nullable = false)
    private ProductionBatch batch;

    @Column(nullable = false)
    private LocalDateTime sentToLabAt;

    private LocalDateTime testDateTime;

    @Column(precision = 10, scale = 3)
    private BigDecimal hardness;

    @Column(precision = 10, scale = 3)
    private BigDecimal resilience;

    @Column(precision = 10, scale = 3)
    private BigDecimal curingTimeMinutes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LabDecision decision;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tested_by_id")
    private UserAccount testedBy;

    @Column(length = 1500)
    private String comments;

    @Column(nullable = false)
    @Builder.Default
    private boolean reprocessingDecision = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_approved_by_id")
    private UserAccount managerApprovedBy;

    private LocalDateTime managerApprovedAt;

    @OneToMany(mappedBy = "labSample", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<LabTestResult> additionalResults = new ArrayList<>();

    public void addResult(LabTestResult result) {
        additionalResults.add(result);
        result.setLabSample(this);
    }
}

