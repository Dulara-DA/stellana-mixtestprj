package com.stellana.mixing.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "material_shortage_requests", indexes = {
        @Index(name = "idx_shortage_status", columnList = "status"),
        @Index(name = "idx_shortage_required_at", columnList = "required_at")
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MaterialShortageRequest extends BaseEntity {
    @Column(nullable = false, unique = true)
    private String requestNumber;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "press_id", nullable = false)
    private Press press;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_blanking_batch_id")
    private BlankingBatch currentBlankingBatch;

    @Column(nullable = false)
    private Integer currentAvailableBlankQuantity;

    @Column(nullable = false)
    private Integer requestedBlankQuantity;

    @Column(nullable = false)
    private String requiredMaterialCode;

    @Column(nullable = false)
    private LocalDateTime requiredAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ShortagePriority priority;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sender_id", nullable = false)
    private UserAccount sender;

    @Column(nullable = false)
    private String senderEmployeeId;

    @Column(nullable = false)
    private LocalDate productionDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProductionShift senderShift;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ShortageStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_cart_id")
    private BlankingCart linkedCart;

    @OneToMany(mappedBy = "request", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<RequestMessage> messages = new ArrayList<>();

    public void addMessage(RequestMessage message) {
        messages.add(message);
        message.setRequest(this);
    }
}
