import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Program {
  id?: string;
  title: string;
  description?: string;
  date: string;
  start_time?: string;
  end_time?: string;
  address?: string;
  notes?: string;
}

interface ProgramDialogProps {
  open: boolean;
  onClose: () => void;
  program?: Program | null;
  selectedDate?: Date | null;
}

export const ProgramDialog = ({
  open,
  onClose,
  program,
  selectedDate,
}: ProgramDialogProps) => {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    date: "",
    start_time: "",
    end_time: "",
    address: "",
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (program) {
      setFormData({
        title: program.title,
        description: program.description || "",
        date: program.date,
        start_time: program.start_time || "",
        end_time: program.end_time || "",
        address: program.address || "",
      });
    } else if (selectedDate) {
      setFormData({
        title: "",
        description: "",
        date: format(selectedDate, "yyyy-MM-dd"),
        start_time: "",
        end_time: "",
        address: "",
      });
    } else {
      setFormData({
        title: "",
        description: "",
        date: format(new Date(), "yyyy-MM-dd"),
        start_time: "",
        end_time: "",
        address: "",
      });
    }
  }, [program, selectedDate, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (program?.id) {
        const { error } = await supabase
          .from("programs")
          .update({
            ...formData,
            start_time: formData.start_time || null,
            end_time: formData.end_time || null,
            description: formData.description || null,
            address: formData.address || null,
          })
          .eq("id", program.id);

        if (error) throw error;
        toast({ title: "Programa atualizado com sucesso!" });
      } else {
        const { error } = await supabase.from("programs").insert([
          {
            ...formData,
            start_time: formData.start_time || null,
            end_time: formData.end_time || null,
            description: formData.description || null,
            address: formData.address || null,
            user_id: user.id,
          },
        ]);

        if (error) throw error;
        toast({ title: "Programa criado com sucesso!" });
      }

      onClose();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {program ? "Editar Programa" : "Novo Programa"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Data *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start_time">Hora Início</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) =>
                  setFormData({ ...formData, start_time: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_time">Hora Fim</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) =>
                  setFormData({ ...formData, end_time: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              placeholder="Ex: Times Square, New York, NY"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
