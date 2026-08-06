package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.InventoryTransactionView;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.repository.InventoryTransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

import static com.stellana.mixing.api.ApiMapper.inventoryTransaction;

@Service
@RequiredArgsConstructor
public class InventoryLedgerService {
    private final InventoryTransactionRepository repository;
    private final ShiftService shiftService;

    @Transactional(propagation = Propagation.MANDATORY)
    public InventoryTransaction record(
            InventoryTransactionType type,
            ProductionSection sourceSection,
            ProductionSection destinationSection,
            String sourceType,
            Long sourceId,
            String destinationType,
            Long destinationId,
            BigDecimal quantity,
            String unit,
            BigDecimal weightKg,
            UserAccount actor,
            String reasonReference
    ) {
        return repository.save(InventoryTransaction.builder()
                .transactionType(type)
                .sourceSection(sourceSection)
                .destinationSection(destinationSection)
                .sourceRecordType(sourceType)
                .sourceRecordId(sourceId)
                .destinationRecordType(destinationType)
                .destinationRecordId(destinationId)
                .quantity(quantity)
                .unit(unit)
                .weightKg(weightKg)
                .actor(actor)
                .transactionTime(shiftService.now())
                .reasonReference(reasonReference)
                .build());
    }

    @Transactional(readOnly = true)
    public List<InventoryTransactionView> recent() {
        return repository.findTop200ByOrderByTransactionTimeDesc().stream()
                .map(com.stellana.mixing.api.ApiMapper::inventoryTransaction)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<InventoryTransactionView> forRecord(String recordType, Long recordId) {
        return repository.findAllBySourceRecordTypeAndSourceRecordIdOrderByTransactionTimeAsc(
                        recordType, recordId).stream()
                .map(com.stellana.mixing.api.ApiMapper::inventoryTransaction)
                .toList();
    }
}
