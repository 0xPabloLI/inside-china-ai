"""Patch SoulX-FlashTalk wav2vec2.py for transformers compatibility.

Root cause: In transformers >= 4.49, Wav2Vec2Encoder.forward() was rewritten
to NOT accept output_hidden_states/output_attentions/return_dict kwargs and
to only return BaseModelOutput(last_hidden_state=...). The hidden_states
field is always None, breaking SoulX's wav2vec2.py which expects
encoder_outputs.hidden_states to be a tuple.

Fix: Inject a monkey-patch at the top of SoulX's wav2vec2.py that replaces
Wav2Vec2Encoder.forward and Wav2Vec2EncoderStableLayerNorm.forward with
versions that collect and return hidden_states when requested.
"""
import sys

p = "/repo/flash_talk/infinite_talk/audio_analysis/wav2vec2.py"
c = open(p).read()

# Inject monkey-patch code right after the transformers import line
inject = '''
# ── Begin monkey-patch for transformers >= 4.49 compatibility ──
import torch as _torch
from transformers.modeling_outputs import BaseModelOutput as _BaseModelOutput
from transformers.integrations.deepspeed import is_deepspeed_zero3_enabled as _is_ds
from transformers.integrations.fsdp import is_fsdp_managed_module as _is_fsdp
from transformers.masking_utils import create_bidirectional_mask as _make_mask
import transformers.models.wav2vec2.modeling_wav2vec2 as _w2v2_mod


def _encoder_forward(self, hidden_states, attention_mask=None,
                     output_hidden_states=False, output_attentions=False,
                     return_dict=True, **kwargs):
    if attention_mask is not None:
        expand = attention_mask.unsqueeze(-1).repeat(1, 1, hidden_states.shape[2])
        hidden_states[~expand] = 0
    attention_mask = _make_mask(config=self.config,
                                inputs_embeds=hidden_states,
                                attention_mask=attention_mask)
    position_embeddings = self.pos_conv_embed(hidden_states)
    hidden_states = hidden_states + position_embeddings.to(hidden_states.device)
    hidden_states = self.layer_norm(hidden_states)
    hidden_states = self.dropout(hidden_states)

    all_hs = () if output_hidden_states else None
    synced = _is_ds() or _is_fsdp(self)
    for layer in self.layers:
        if output_hidden_states:
            all_hs = all_hs + (hidden_states,)
        dropout_prob = _torch.rand([])
        skip = self.training and dropout_prob < self.config.layerdrop
        if not skip or synced:
            hidden_states = layer(hidden_states, attention_mask=attention_mask, **kwargs)
    if output_hidden_states:
        all_hs = all_hs + (hidden_states,)
    if not return_dict:
        return tuple(v for v in [hidden_states, all_hs, None] if v is not None)
    return _BaseModelOutput(last_hidden_state=hidden_states,
                            hidden_states=all_hs, attentions=None)


def _encoder_stable_forward(self, hidden_states, attention_mask=None,
                            output_hidden_states=False, output_attentions=False,
                            return_dict=True, **kwargs):
    if attention_mask is not None:
        expand = attention_mask.unsqueeze(-1).repeat(1, 1, hidden_states.shape[2])
        hidden_states[~expand] = 0
    attention_mask = _make_mask(config=self.config,
                                inputs_embeds=hidden_states,
                                attention_mask=attention_mask)
    position_embeddings = self.pos_conv_embed(hidden_states)
    hidden_states = hidden_states + position_embeddings
    hidden_states = self.dropout(hidden_states)

    all_hs = () if output_hidden_states else None
    synced = _is_ds() or _is_fsdp(self)
    for layer in self.layers:
        if output_hidden_states:
            all_hs = all_hs + (hidden_states,)
        dropout_prob = _torch.rand([])
        skip = self.training and dropout_prob < self.config.layerdrop
        if not skip or synced:
            hidden_states = layer(hidden_states, attention_mask=attention_mask, **kwargs)
    hidden_states = self.layer_norm(hidden_states)
    if output_hidden_states:
        all_hs = all_hs + (hidden_states,)
    if not return_dict:
        return tuple(v for v in [hidden_states, all_hs, None] if v is not None)
    return _BaseModelOutput(last_hidden_state=hidden_states,
                            hidden_states=all_hs, attentions=None)


_w2v2_mod.Wav2Vec2Encoder.forward = _encoder_forward
_w2v2_mod.Wav2Vec2EncoderStableLayerNorm.forward = _encoder_stable_forward
# ── End monkey-patch ──
'''

marker = "from .torch_utils import linear_interpolation"
if marker not in c:
    print("PATCH ERROR: marker not found in wav2vec2.py", file=sys.stderr)
    sys.exit(1)

c = c.replace(marker, marker + "\n" + inject, 1)

# Also force return_dict=True in the two forward methods
old_rd = "return_dict = return_dict if return_dict is not None else self.config.use_return_dict"
new_rd = "return_dict = True"
cnt = c.count(old_rd)
if cnt:
    c = c.replace(old_rd, new_rd)
    print(f"PATCH: replaced {cnt}x return_dict")

open(p, "w").write(c)
print("PATCH: injected Wav2Vec2Encoder monkey-patch into wav2vec2.py")
print("PATCH: done")
