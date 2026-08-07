package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.service.MouldingService;
import com.stellana.mixing.service.BlankReturnService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/moulding")
@RequiredArgsConstructor
public class MouldingController {
    private final MouldingService mouldingService;
    private final BlankReturnService blankReturnService;

    @GetMapping("/presses")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','MOULDING_OPERATOR',"
            + "'MOULDING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<PressView> presses() {
        return mouldingService.listPresses();
    }

    @PatchMapping("/presses/{id}/status")
    @PreAuthorize("hasAnyRole('MOULDING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public PressView changePressStatus(
            @PathVariable Long id,
            @Valid @RequestBody PressStatusRequest request
    ) {
        return mouldingService.changePressStatus(id, request);
    }

    @PatchMapping("/presses/{id}/current-item")
    @PreAuthorize("hasAnyRole('MOULDING_OPERATOR','MOULDING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public PressView updateCurrentItem(
            @PathVariable Long id,
            @Valid @RequestBody UpdatePressItemRequest request
    ) {
        return mouldingService.updateCurrentItem(id, request);
    }

    @GetMapping("/upcoming-carts")
    @PreAuthorize("hasAnyRole('BLANKING_OPERATOR','BLANKING_SUPERVISOR','MOULDING_OPERATOR',"
            + "'MOULDING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<BlankingCartView> upcomingCarts() {
        return mouldingService.upcomingCarts();
    }

    @PostMapping("/carts/{cartId}/receive")
    @PreAuthorize("hasAnyRole('MOULDING_OPERATOR','MOULDING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public CartReceiptView receiveCart(
            @PathVariable Long cartId,
            @Valid @RequestBody ReceiveCartRequest request
    ) {
        return mouldingService.receiveCart(cartId, request);
    }

    @GetMapping("/receipts")
    @PreAuthorize("hasAnyRole('MOULDING_OPERATOR','MOULDING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<CartReceiptView> receipts() {
        return mouldingService.receipts();
    }

    @GetMapping("/records")
    @PreAuthorize("hasAnyRole('MOULDING_OPERATOR','MOULDING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<MouldingProductionRecordView> records() {
        return mouldingService.listRecords();
    }

    @PostMapping("/records/start")
    @PreAuthorize("hasAnyRole('MOULDING_OPERATOR','MOULDING_SUPERVISOR','SYSTEM_ADMIN')")
    public MouldingProductionRecordView startRecord(
            @Valid @RequestBody StartMouldingRecordRequest request
    ) {
        return mouldingService.startRecord(request);
    }

    @PostMapping("/records/{id}/complete")
    @PreAuthorize("hasAnyRole('MOULDING_OPERATOR','MOULDING_SUPERVISOR','SYSTEM_ADMIN')")
    public MouldingProductionRecordView completeRecord(
            @PathVariable Long id,
            @Valid @RequestBody CompleteMouldingRecordRequest request
    ) {
        return mouldingService.completeRecord(id, request);
    }

    @PatchMapping("/records/{id}/correct")
    @PreAuthorize("hasAnyRole('MANAGER','SYSTEM_ADMIN')")
    public MouldingProductionRecordView correctRecord(
            @PathVariable Long id,
            @Valid @RequestBody CorrectMouldingRecordRequest request
    ) {
        return mouldingService.correctRecord(id, request);
    }

    @GetMapping("/returns")
    @PreAuthorize("hasAnyRole('MOULDING_OPERATOR','MOULDING_SUPERVISOR','BLANKING_OPERATOR',"
            + "'BLANKING_SUPERVISOR','MANAGER','SYSTEM_ADMIN')")
    public List<BlankReturnView> returns() {
        return blankReturnService.list();
    }

    @PostMapping("/returns")
    @PreAuthorize("hasAnyRole('MOULDING_OPERATOR','MOULDING_SUPERVISOR','SYSTEM_ADMIN')")
    public BlankReturnView prepareReturn(@Valid @RequestBody CreateBlankReturnRequest request) {
        return blankReturnService.prepare(request);
    }

    @PostMapping("/returns/{id}/send")
    @PreAuthorize("hasAnyRole('MOULDING_OPERATOR','MOULDING_SUPERVISOR','SYSTEM_ADMIN')")
    public BlankReturnView sendReturn(@PathVariable Long id) {
        return blankReturnService.send(id);
    }
}
