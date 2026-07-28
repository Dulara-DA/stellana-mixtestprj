package com.stellana.mixing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "shortage_request_messages")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RequestMessage extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "request_id", nullable = false)
    private MaterialShortageRequest request;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sender_id", nullable = false)
    private UserAccount sender;

    @Column(nullable = false, length = 2000)
    private String message;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private ShortageStatus statusSnapshot;
}
